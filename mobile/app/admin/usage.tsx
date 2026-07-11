import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import type { AdminUsageRow } from "../../src/api/adminTypes";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, EmptyState, Screen, SkeletonCard, TextField, toast } from "../../src/components/ui";
import { space, text } from "../../src/theme";

export default function AdminUsage() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<string | null>(null);

  const usage = useQuery({
    queryKey: ["admin-usage", page, search],
    queryFn: () => api.adminUsage(page, search || undefined),
  });

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Usage" />
      <Screen scroll padded>
        <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}>
          <View style={{ flex: 1 }}>
            <TextField
              value={q}
              onChangeText={setQ}
              placeholder="Search by email…"
              autoCapitalize="none"
              onSubmitEditing={() => {
                setPage(1);
                setSearch(q.trim());
              }}
            />
          </View>
          <Button
            label="Search"
            variant="secondary"
            size="sm"
            style={{ height: 50 }}
            onPress={() => {
              setPage(1);
              setSearch(q.trim());
            }}
          />
        </View>

        {usage.isLoading ? (
          <SkeletonCard lines={3} />
        ) : !usage.data?.items.length ? (
          <EmptyState emoji="⏱️" title="No usage records" message="Try a different search." />
        ) : (
          <View style={{ gap: space.sm }}>
            {usage.data.items.map((u, i) => {
              const key = `${u.user_id}-${i}`;
              return (
                <UsageRow
                  key={key}
                  row={u}
                  open={adjusting === key}
                  onToggle={() => setAdjusting(adjusting === key ? null : key)}
                  onDone={() => setAdjusting(null)}
                />
              );
            })}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.md }}>
              <Button label="‹ Prev" variant="ghost" size="sm" disabled={page <= 1} onPress={() => setPage((p) => Math.max(1, p - 1))} />
              <Text style={[text.caption, { alignSelf: "center" }]}>
                Page {usage.data.page} of {usage.data.pages || 1}
              </Text>
              <Button
                label="Next ›"
                variant="ghost"
                size="sm"
                disabled={page >= (usage.data.pages || 1)}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          </View>
        )}
      </Screen>
    </View>
  );
}

function UsageRow({
  row,
  open,
  onToggle,
  onDone,
}: {
  row: AdminUsageRow;
  open: boolean;
  onToggle: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const [minutes, setMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const n = parseInt(minutes, 10);
    if (!n) return;
    setSaving(true);
    try {
      await api.adminAdjustUsage(row.user_id, n);
      toast.success("Usage adjusted");
      setMinutes("");
      void qc.invalidateQueries({ queryKey: ["admin-usage"] });
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Text style={text.bodyMedium}>{row.user_email}</Text>
          <Text style={text.caption}>
            {row.available_minutes} min available · {Math.round(row.used_seconds / 60)} min used
          </Text>
        </View>
        <Button label={open ? "Cancel" : "Adjust"} variant="ghost" size="sm" onPress={onToggle} />
      </View>
      {open ? (
        <View style={{ marginTop: space.md, gap: space.sm }}>
          <TextField
            value={minutes}
            onChangeText={setMinutes}
            keyboardType="numbers-and-punctuation"
            placeholder="e.g. 30 to grant, -30 to deduct"
          />
          <Button label="Apply" variant="cta" size="sm" loading={saving} onPress={() => void submit()} />
        </View>
      ) : null}
    </Card>
  );
}
