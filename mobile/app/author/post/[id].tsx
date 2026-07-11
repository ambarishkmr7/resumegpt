import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authorApi } from "../../../src/api/authorClient";
import { errorMessage } from "../../../src/api/errors";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Button, Chip, Screen, SkeletonCard, TextField, toast } from "../../../src/components/ui";
import { space, text } from "../../../src/theme";

export default function EditAuthorPost() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === "new";
  const qc = useQueryClient();

  const posts = useQuery({ queryKey: ["author-posts"], queryFn: authorApi.posts, enabled: !isNew });
  const existing = posts.data?.find((p) => p.id === id);

  const [title, setTitle] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"draft" | "published">("draft");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existing) {
      setTitle(existing.title);
      setExcerpt(existing.excerpt || "");
      setContent(existing.content);
      setStatus(existing.status === "published" ? "published" : "draft");
    }
  }, [existing]);

  const save = async () => {
    if (!title.trim() || !content.trim()) {
      toast.error("Title and content are required.");
      return;
    }
    setSaving(true);
    try {
      if (isNew) {
        await authorApi.createPost({ title, excerpt, content, status });
      } else {
        await authorApi.updatePost(id!, { title, excerpt, content, status });
      }
      toast.success("Post saved");
      void qc.invalidateQueries({ queryKey: ["author-posts"] });
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (isNew) return;
    Alert.alert("Delete this post?", "This removes it from the public blog.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await authorApi.deletePost(id!);
            void qc.invalidateQueries({ queryKey: ["author-posts"] });
            router.back();
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);
  };

  if (!isNew && posts.isLoading) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title="Post" />
        <Screen padded>
          <SkeletonCard lines={5} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title={isNew ? "New post" : "Edit post"} />
      <Screen scroll padded>
        <View style={{ gap: space.md }}>
          <TextField label="Title" value={title} onChangeText={setTitle} placeholder="How to write a resume in 2026" />
          <TextField label="Excerpt" value={excerpt} onChangeText={setExcerpt} multiline placeholder="One-line summary shown in the blog list" />
          <TextField label="Content (markdown)" value={content} onChangeText={setContent} multiline style={{ minHeight: 320 }} />
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Chip label="Draft" selected={status === "draft"} onPress={() => setStatus("draft")} />
            <Chip label="Published" selected={status === "published"} onPress={() => setStatus("published")} />
          </View>
          <Button label="Save" variant="cta" loading={saving} onPress={() => void save()} />
          {!isNew ? <Button label="Delete post" variant="ghost" onPress={remove} /> : null}
        </View>
      </Screen>
    </View>
  );
}
