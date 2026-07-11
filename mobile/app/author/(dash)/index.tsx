import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Text, View } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authorApi } from "../../../src/api/authorClient";
import { errorMessage } from "../../../src/api/errors";
import { useAuthorAuth } from "../../../src/auth/authorStore";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Button, Card, Chip, EmptyState, Screen, SkeletonCard, TextField, toast } from "../../../src/components/ui";
import { color, space, text } from "../../../src/theme";

export default function AuthorDashboard() {
  const author = useAuthorAuth((s) => s.author);
  const clearSession = useAuthorAuth((s) => s.clearSession);
  const qc = useQueryClient();

  const [name, setName] = useState(author?.name || "");
  const [role, setRole] = useState(author?.role || "");
  const [bio, setBio] = useState(author?.bio || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (author) {
      setName(author.name || "");
      setRole(author.role || "");
      setBio(author.bio || "");
    }
  }, [author]);

  const posts = useQuery({ queryKey: ["author-posts"], queryFn: authorApi.posts });

  const saveProfile = async () => {
    setSaving(true);
    try {
      await authorApi.updateProfile({ name, role, bio });
      toast.success("Profile saved");
      void useAuthorAuth.getState().refreshAuthor();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const removePost = (id: string, title: string) => {
    Alert.alert(`Delete "${title}"?`, "This removes it from the public blog.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await authorApi.deletePost(id);
            void qc.invalidateQueries({ queryKey: ["author-posts"] });
          } catch (e) {
            toast.error(errorMessage(e));
          }
        },
      },
    ]);
  };

  const logout = () => {
    Alert.alert("Log out?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: () => void clearSession() },
    ]);
  };

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Author dashboard" />
      <Screen scroll padded>
        <Card style={{ gap: space.md, marginBottom: space.xl }}>
          <Text style={text.title}>Your profile</Text>
          <TextField label="Name" value={name} onChangeText={setName} />
          <TextField label="Role" value={role} onChangeText={setRole} placeholder="Lead Career Editor" />
          <TextField label="Bio" value={bio} onChangeText={setBio} multiline />
          <Button label="Save profile" variant="cta" size="sm" loading={saving} onPress={() => void saveProfile()} />
        </Card>

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: space.md }}>
          <Text style={[text.title, { flex: 1 }]}>Your posts</Text>
          <Button label="+ New post" variant="secondary" size="sm" onPress={() => router.push("/author/post/new")} />
        </View>

        {posts.isLoading ? (
          <SkeletonCard lines={3} />
        ) : !posts.data?.length ? (
          <EmptyState emoji="✍️" title="No posts yet" message="Write your first article." />
        ) : (
          <View style={{ gap: space.sm }}>
            {posts.data.map((p) => (
              <Card key={p.id} onPress={() => router.push(`/author/post/${p.id}`)}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1 }}>
                    <Text style={text.bodyMedium}>{p.title}</Text>
                    <Text style={text.caption}>{p.excerpt}</Text>
                  </View>
                  <Chip
                    label={p.status}
                    tint={p.status === "published" ? color.primaryFaint : color.surfaceSunken}
                    textColor={p.status === "published" ? color.primaryDark : color.inkSoft}
                  />
                </View>
                <Button
                  label="Delete"
                  variant="ghost"
                  size="sm"
                  style={{ marginTop: space.sm, alignSelf: "flex-start" }}
                  onPress={() => removePost(p.id, p.title)}
                />
              </Card>
            ))}
          </View>
        )}

        <Button label="Log out" variant="danger" style={{ marginTop: space.xl }} onPress={logout} />
      </Screen>
    </View>
  );
}
