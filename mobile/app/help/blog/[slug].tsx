import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { getPost } from "../../../src/data/blogPosts";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Card, Chip, EmptyState, Screen } from "../../../src/components/ui";
import { color, space, text } from "../../../src/theme";

export default function BlogPost() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const post = getPost(slug || "");

  if (!post) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title="Blog" />
        <Screen padded>
          <EmptyState emoji="📄" title="Post not found" message="This article may have moved." />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title={post.tag} />
      <Screen scroll padded>
        <Chip label={post.tag} tint={color.primaryFaint} textColor={color.primaryDark} />
        <Text style={[text.hero, { marginTop: space.md, marginBottom: space.xs }]}>{post.title}</Text>
        <Text style={[text.caption, { marginBottom: space.lg }]}>
          {post.date} · {post.readTime} read
        </Text>

        <View style={{ gap: space.lg }}>
          {post.content.map((section, i) => (
            <View key={i} style={{ gap: space.sm }}>
              <Text style={text.title}>{section.h2}</Text>
              {section.p.map((para, j) => (
                <Text key={j} style={[text.body, { lineHeight: 24 }]}>
                  {para}
                </Text>
              ))}
            </View>
          ))}
        </View>

        {post.takeaways?.length ? (
          <Card tint={color.primaryFaint} style={{ marginTop: space.xl, gap: space.sm }}>
            <Text style={text.title}>Key takeaways</Text>
            {post.takeaways.map((t, i) => (
              <Text key={i} style={text.body}>
                • {t}
              </Text>
            ))}
          </Card>
        ) : null}
      </Screen>
    </View>
  );
}
