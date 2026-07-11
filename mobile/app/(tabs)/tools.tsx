import { router } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Resume } from "../../src/api/types";
import { ResumePicker } from "../../src/components/resume/ResumePicker";
import { Card, Screen } from "../../src/components/ui";
import { useResumes } from "../../src/hooks/queries";
import { color, space, text } from "../../src/theme";

const TOOLS = [
  {
    key: "analyze",
    emoji: "🔍",
    title: "Career Analysis",
    desc: "Deep AI review of your resume & trajectory",
    tint: color.primaryFaint,
  },
  {
    key: "roadmap",
    emoji: "🗺️",
    title: "Career Roadmap",
    desc: "Certs, courses & channels to level up",
    tint: color.ctaSoft,
  },
  {
    key: "cover-letter",
    emoji: "✉️",
    title: "Cover Letter",
    desc: "Tailored letter for any job in seconds",
    tint: color.goodSoft,
  },
] as const;

export default function ToolsTab() {
  const resumes = useResumes();
  const [selected, setSelected] = useState<Resume | null>(null);
  const list = resumes.data ?? [];
  // Auto-select when there's exactly one resume.
  const active = selected ?? (list.length === 1 ? list[0] : null);

  return (
    <Screen
      testID="tools-screen"
      title="AI Tools"
      subtitle="Supercharge your job hunt."
    >
      <View style={{ gap: space.md, marginBottom: space.xl }}>
        <Card testID="tool-jobs" tint={color.goodSoft} onPress={() => router.push("/jobs")}>
          <View style={styles.toolRow}>
            <Text style={styles.toolEmoji}>💼</Text>
            <View style={{ flex: 1 }}>
              <Text style={text.heading}>Find Jobs</Text>
              <Text style={text.caption}>AI-matched listings across LinkedIn, Naukri & more</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </View>
        </Card>
        <Card testID="tool-career-chat" tint={color.primaryFaint} onPress={() => router.push("/career-chat")}>
          <View style={styles.toolRow}>
            <Text style={styles.toolEmoji}>💬</Text>
            <View style={{ flex: 1 }}>
              <Text style={text.heading}>Career Assistant</Text>
              <Text style={text.caption}>Chat with AI about your career, saved as threads</Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </View>
        </Card>
      </View>

      {!active ? (
        <ResumePicker
          resumes={list}
          loading={resumes.isLoading}
          onPick={setSelected}
          hint="Pick the resume to run per-resume AI tools on:"
        />
      ) : (
        <>
          <Card
            style={{ marginBottom: space.xl }}
            onPress={() => setSelected(null)}
          >
            <Text style={text.caption}>Working with</Text>
            <View style={styles.activeRow}>
              <Text style={text.heading} numberOfLines={1}>
                {active.title}
              </Text>
              {list.length > 1 ? <Text style={text.caption}>Change ›</Text> : null}
            </View>
          </Card>

          <View style={{ gap: space.md }}>
            {TOOLS.map((tool) => (
              <Card
                key={tool.key}
                testID={`tool-${tool.key}`}
                tint={tool.tint}
                onPress={() => router.push(`/tools/${active.id}/${tool.key}`)}
              >
                <View style={styles.toolRow}>
                  <Text style={styles.toolEmoji}>{tool.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={text.heading}>{tool.title}</Text>
                    <Text style={text.caption}>{tool.desc}</Text>
                  </View>
                  <Text style={styles.chev}>›</Text>
                </View>
              </Card>
            ))}
            <Card
              testID="tool-ats"
              onPress={() => router.push(`/resume/${active.id}/ats`)}
            >
              <View style={styles.toolRow}>
                <Text style={styles.toolEmoji}>🎯</Text>
                <View style={{ flex: 1 }}>
                  <Text style={text.heading}>ATS Score</Text>
                  <Text style={text.caption}>
                    Score your resume against any job description
                  </Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </View>
            </Card>
          </View>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  activeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  toolRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  toolEmoji: { fontSize: 30 },
  chev: { fontSize: 26, color: color.inkFaint },
});
