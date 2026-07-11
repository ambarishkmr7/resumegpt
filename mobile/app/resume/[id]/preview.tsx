import { useLocalSearchParams } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { SkeletonCard } from "../../../src/components/ui";
import { useResume, useTemplates } from "../../../src/hooks/queries";
import { color, fontFamily, radius, space } from "../../../src/theme";

// Simplified native preview: one clean layout tinted with the template accent.
// Full multi-template fidelity lives in the PDF/DOCX export.
export default function Preview() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resume = useResume(id);
  const templates = useTemplates();

  const content = resume.data?.content;
  const accent =
    templates.data?.find((t) => t.id === resume.data?.template_id)?.accent ||
    color.primary;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Preview" />
      {!content ? (
        <View style={{ padding: space.lg }}>
          <SkeletonCard lines={6} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.page}>
          <View style={styles.sheet}>
            <Text style={[styles.name, { color: accent }]}>
              {content.contact?.name || "Your Name"}
            </Text>
            <Text style={styles.role}>{content.contact?.title || ""}</Text>
            <Text style={styles.meta}>
              {[content.contact?.email, content.contact?.phone, content.contact?.location]
                .filter(Boolean)
                .join(" · ")}
            </Text>

            {content.summary ? (
              <PreviewSection title="Summary" accent={accent}>
                <Text style={styles.body}>{content.summary}</Text>
              </PreviewSection>
            ) : null}

            {(content.experience ?? []).length > 0 ? (
              <PreviewSection title="Experience" accent={accent}>
                {(content.experience ?? []).map((e, i) => (
                  <View key={i} style={{ marginBottom: space.md }}>
                    <Text style={styles.itemTitle}>
                      {e.title}
                      {e.company ? ` · ${e.company}` : ""}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {[e.start, e.end].filter(Boolean).join(" – ")}
                    </Text>
                    {(e.bullets ?? [])
                      .filter(Boolean)
                      .map((b, j) => (
                        <Text key={j} style={styles.bullet}>
                          •  {b}
                        </Text>
                      ))}
                  </View>
                ))}
              </PreviewSection>
            ) : null}

            {(content.education ?? []).length > 0 ? (
              <PreviewSection title="Education" accent={accent}>
                {(content.education ?? []).map((e, i) => (
                  <View key={i} style={{ marginBottom: space.sm }}>
                    <Text style={styles.itemTitle}>{e.degree}</Text>
                    <Text style={styles.itemMeta}>
                      {e.school}
                      {e.end ? ` · ${e.end}` : ""}
                    </Text>
                  </View>
                ))}
              </PreviewSection>
            ) : null}

            {(content.skill_ratings ?? []).length > 0 ? (
              <PreviewSection title="Skills" accent={accent}>
                <Text style={styles.body}>
                  {(content.skill_ratings ?? [])
                    .map((s) => s.name)
                    .filter(Boolean)
                    .join("  ·  ")}
                </Text>
              </PreviewSection>
            ) : null}

            {(content.projects ?? []).length > 0 ? (
              <PreviewSection title="Projects" accent={accent}>
                {(content.projects ?? []).map((p, i) => (
                  <View key={i} style={{ marginBottom: space.sm }}>
                    <Text style={styles.itemTitle}>{p.name}</Text>
                    {p.description ? (
                      <Text style={styles.body}>{p.description}</Text>
                    ) : null}
                  </View>
                ))}
              </PreviewSection>
            ) : null}

            {(content.certifications ?? []).length > 0 ? (
              <PreviewSection title="Certifications" accent={accent}>
                {(content.certifications ?? []).map((cert, i) => (
                  <Text key={i} style={styles.bullet}>
                    •  {typeof cert === "string" ? cert : JSON.stringify(cert)}
                  </Text>
                ))}
              </PreviewSection>
            ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function PreviewSection({
  title,
  accent,
  children,
}: {
  title: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Text style={[styles.sectionTitle, { color: accent }]}>
        {title.toUpperCase()}
      </Text>
      <View style={[styles.rule, { backgroundColor: accent }]} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: space.lg, paddingBottom: 60 },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: radius.md,
    padding: space.xl,
    borderWidth: 1,
    borderColor: color.line,
  },
  name: { fontFamily: fontFamily.displayBold, fontSize: 26 },
  role: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 15,
    color: color.inkSoft,
    marginTop: 2,
  },
  meta: {
    fontFamily: fontFamily.body,
    fontSize: 12,
    color: color.inkFaint,
    marginTop: 6,
  },
  sectionTitle: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 12.5,
    letterSpacing: 1,
  },
  rule: { height: 2, borderRadius: 1, marginVertical: 6, width: 42 },
  itemTitle: { fontFamily: fontFamily.bodySemiBold, fontSize: 14, color: color.ink },
  itemMeta: { fontFamily: fontFamily.body, fontSize: 12, color: color.inkFaint },
  body: { fontFamily: fontFamily.body, fontSize: 13, lineHeight: 19, color: color.ink },
  bullet: {
    fontFamily: fontFamily.body,
    fontSize: 13,
    lineHeight: 19,
    color: color.ink,
  },
});
