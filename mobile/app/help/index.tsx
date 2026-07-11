import { router } from "expo-router";
import { Text, View } from "react-native";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Card, Screen } from "../../src/components/ui";
import { color, space, text } from "../../src/theme";

const ITEMS = [
  { emoji: "📘", title: "User Guide", desc: "A quick tour of every screen", href: "/help/guide" },
  { emoji: "✍️", title: "Blog", desc: "Resume, ATS & career advice", href: "/help/blog" },
  { emoji: "🔎", title: "Resources", desc: "Our editorial team & sourcing", href: "/help/resources" },
] as const;

export default function HelpHub() {
  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Help & Resources" />
      <Screen scroll padded>
        <View style={{ gap: space.md }}>
          {ITEMS.map((item) => (
            <Card key={item.href} onPress={() => router.push(item.href as never)}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Text style={{ fontSize: 28 }}>{item.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={text.heading}>{item.title}</Text>
                  <Text style={text.caption}>{item.desc}</Text>
                </View>
                <Text style={{ fontSize: 22, color: color.inkFaint }}>›</Text>
              </View>
            </Card>
          ))}
        </View>
      </Screen>
    </View>
  );
}
