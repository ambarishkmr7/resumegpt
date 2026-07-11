import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { BLOG_CATEGORIES, BLOG_POSTS } from "../../../src/data/blogPosts";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Card, Chip, Screen } from "../../../src/components/ui";
import { color, space, text } from "../../../src/theme";

export default function BlogList() {
  const [category, setCategory] = useState("All");
  const posts = category === "All" ? BLOG_POSTS : BLOG_POSTS.filter((p) => p.tag === category);

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Blog" />
      <Screen scroll padded>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ flexDirection: "row", gap: space.sm, marginBottom: space.lg }}
        >
          {["All", ...BLOG_CATEGORIES].map((c) => (
            <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </ScrollView>

        <View style={{ gap: space.md }}>
          {posts.map((post) => (
            <Card key={post.slug} onPress={() => router.push(`/help/blog/${post.slug}` as never)}>
              <Chip label={post.tag} tint={color.primaryFaint} textColor={color.primaryDark} />
              <Text style={[text.heading, { marginTop: space.sm }]}>{post.title}</Text>
              <Text style={text.caption} numberOfLines={2}>
                {post.excerpt}
              </Text>
              <Text style={[text.caption, { marginTop: space.sm, color: color.inkFaint }]}>
                {post.date} · {post.readTime} read
              </Text>
            </Card>
          ))}
        </View>
      </Screen>
    </View>
  );
}
