import { useState } from "react";
import { Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import type { CmsPage } from "../../src/api/adminTypes";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, EmptyState, Screen, SkeletonCard, TextField, toast } from "../../src/components/ui";
import { space, text } from "../../src/theme";

export default function AdminCms() {
  const qc = useQueryClient();
  const pages = useQuery({ queryKey: ["admin-cms"], queryFn: api.adminCmsPages });
  const [editing, setEditing] = useState<CmsPage | null>(null);
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);

  const open = (p: CmsPage) => {
    setEditing(p);
    setTitle(p.title);
    setContent(p.content);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await api.adminUpdateCms(editing.slug, { title, content });
      toast.success("Page saved");
      setEditing(null);
      void qc.invalidateQueries({ queryKey: ["admin-cms"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title={editing.slug} />
        <Screen scroll padded>
          <TextField label="Title" value={title} onChangeText={setTitle} />
          <Text style={[text.label, { marginTop: space.md, marginBottom: 6 }]}>Content (markdown)</Text>
          <TextField value={content} onChangeText={setContent} multiline style={{ minHeight: 320 }} />
          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg }}>
            <Button label="Cancel" variant="ghost" onPress={() => setEditing(null)} style={{ flex: 1 }} />
            <Button label="Save" variant="cta" loading={saving} onPress={() => void save()} style={{ flex: 1 }} />
          </View>
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="CMS pages" />
      <Screen scroll padded>
        {pages.isLoading ? (
          <SkeletonCard lines={4} />
        ) : !pages.data?.length ? (
          <EmptyState emoji="📝" title="No pages" message="Nothing to edit yet." />
        ) : (
          <View style={{ gap: space.sm }}>
            {pages.data.map((p) => (
              <Card key={p.id} onPress={() => open(p)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <Text style={{ fontSize: 22 }}>{p.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={text.bodyMedium}>{p.title}</Text>
                    <Text style={text.caption}>/{p.slug}</Text>
                  </View>
                </View>
              </Card>
            ))}
          </View>
        )}
      </Screen>
    </View>
  );
}
