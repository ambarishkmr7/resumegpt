import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, Chip, EmptyState, Screen, SkeletonCard, TextField } from "../../src/components/ui";
import { color, space, text } from "../../src/theme";

export default function AdminUsers() {
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const users = useQuery({
    queryKey: ["admin-users", page, search],
    queryFn: () => api.adminUsers(page, search || undefined),
  });

  const runSearch = () => {
    setPage(1);
    setSearch(q.trim());
  };

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Users" />
      <Screen scroll padded>
        <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}>
          <View style={{ flex: 1 }}>
            <TextField
              value={q}
              onChangeText={setQ}
              placeholder="Search by email…"
              autoCapitalize="none"
              onSubmitEditing={runSearch}
            />
          </View>
          <Button label="Search" variant="secondary" size="sm" onPress={runSearch} style={{ height: 50 }} />
        </View>

        {users.isLoading ? (
          <SkeletonCard lines={4} />
        ) : !users.data?.items.length ? (
          <EmptyState emoji="👥" title="No users found" message="Try a different search." />
        ) : (
          <View style={{ gap: space.sm }}>
            {users.data.items.map((u) => (
              <Card key={u.id}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={text.bodyMedium}>{u.name || u.email}</Text>
                    <Text style={text.caption}>{u.email}</Text>
                  </View>
                  {u.is_admin ? <Chip label="Admin" tint={color.ctaSoft} textColor={color.ctaDark} /> : null}
                  {u.is_subscribed ? <Chip label="⭐ Elite" tint={color.primaryFaint} textColor={color.primaryDark} /> : null}
                </View>
              </Card>
            ))}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.md }}>
              <Button
                label="‹ Prev"
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onPress={() => setPage((p) => Math.max(1, p - 1))}
              />
              <Text style={[text.caption, { alignSelf: "center" }]}>
                Page {users.data.page} of {users.data.pages || 1}
              </Text>
              <Button
                label="Next ›"
                variant="ghost"
                size="sm"
                disabled={page >= (users.data.pages || 1)}
                onPress={() => setPage((p) => p + 1)}
              />
            </View>
          </View>
        )}
      </Screen>
    </View>
  );
}
