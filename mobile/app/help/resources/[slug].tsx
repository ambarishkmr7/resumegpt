import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { AUTHORS, RESOURCE_PAGES } from "../../../src/data/resourcePages";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Card, EmptyState, Screen } from "../../../src/components/ui";
import { color, space, text } from "../../../src/theme";
import { safeOpenUrl } from "../../../src/utils/safeOpenUrl";

export default function ResourcePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const page = slug ? RESOURCE_PAGES[slug as keyof typeof RESOURCE_PAGES] : undefined;

  if (!page) {
    return (
      <View style={{ flex: 1 }}>
        <BackHeader title="Resources" />
        <Screen padded>
          <EmptyState emoji="📄" title="Page not found" message="This page may have moved." />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <BackHeader title={page.title} />
      <Screen scroll padded>
        <Text style={text.hero}>{page.title}</Text>
        <Text style={[text.caption, { marginTop: 2, marginBottom: space.xs }]}>{page.subtitle}</Text>
        <Text style={[text.caption, { marginBottom: space.lg, color: color.inkFaint }]}>
          Updated {page.updated} · Reviewed {page.reviewed}
        </Text>
        <Text style={[text.body, { marginBottom: space.xl, lineHeight: 24 }]}>{page.intro}</Text>

        <View style={{ gap: space.lg }}>
          {page.sections.map((section, i) => (
            <View key={i} style={{ gap: space.sm }}>
              <Text style={text.title}>{section.heading}</Text>

              {"authors" in section && section.authors ? (
                <View style={{ gap: space.sm }}>
                  {section.authors.map((id) => {
                    const author = AUTHORS.find((a) => a.id === id);
                    if (!author) return null;
                    return (
                      <Card key={id}>
                        <Text style={text.bodyMedium}>{author.name}</Text>
                        <Text style={[text.caption, { marginBottom: space.xs }]}>{author.role}</Text>
                        <Text style={text.body}>{author.bio}</Text>
                      </Card>
                    );
                  })}
                </View>
              ) : null}

              {"body" in section && section.body
                ? section.body.map((para, j) => (
                    <Text key={j} style={[text.body, { lineHeight: 24 }]}>
                      {para}
                    </Text>
                  ))
                : null}

              {"list" in section && section.list ? (
                <View style={{ gap: 4 }}>
                  {section.list.map((item, j) => (
                    <Text key={j} style={text.body}>
                      • {item}
                    </Text>
                  ))}
                </View>
              ) : null}

              {"references" in section && section.references ? (
                <View style={{ gap: space.xs }}>
                  {section.references.map((ref, j) => (
                    <Text
                      key={j}
                      style={[text.body, { color: color.primary }]}
                      onPress={() => safeOpenUrl(ref.url)}
                    >
                      {ref.label}
                    </Text>
                  ))}
                </View>
              ) : null}

              {"table" in section && section.table ? (
                <Card style={{ gap: space.xs }}>
                  {section.table.map((row, r) => (
                    <View key={r} style={{ flexDirection: "row", gap: space.sm }}>
                      {row.map((cell, c) => (
                        <Text
                          key={c}
                          style={[
                            r === 0 ? text.label : text.caption,
                            { flex: 1 },
                          ]}
                        >
                          {cell}
                        </Text>
                      ))}
                    </View>
                  ))}
                </Card>
              ) : null}
            </View>
          ))}
        </View>
      </Screen>
    </View>
  );
}
