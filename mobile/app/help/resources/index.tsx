import { router } from "expo-router";
import { Text, View } from "react-native";
import { RESOURCE_PAGES } from "../../../src/data/resourcePages";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Card, Screen } from "../../../src/components/ui";
import { space, text } from "../../../src/theme";

export default function ResourcesList() {
  const pages = Object.values(RESOURCE_PAGES);
  return (
    <View style={{ flex: 1 }}>
      <BackHeader title="Resources" />
      <Screen scroll padded>
        <View style={{ gap: space.md }}>
          {pages.map((page) => (
            <Card key={page.slug} onPress={() => router.push(`/help/resources/${page.slug}` as never)}>
              <Text style={text.heading}>{page.title}</Text>
              <Text style={text.caption}>{page.subtitle}</Text>
            </Card>
          ))}
        </View>
      </Screen>
    </View>
  );
}
