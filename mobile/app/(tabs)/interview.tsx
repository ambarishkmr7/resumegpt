import { router } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import { api } from "../../src/api/client";
import type { Resume } from "../../src/api/types";
import { ResumePicker } from "../../src/components/resume/ResumePicker";
import {
  Button,
  Card,
  EmptyState,
  Screen,
  SkeletonCard,
  toast,
  UsageMeter,
} from "../../src/components/ui";
import {
  useInterviewSessions,
  useResumes,
  useUsage,
} from "../../src/hooks/queries";
import { fmtTime } from "../../src/audio/pcm";
import { color, fontFamily, scoreColor, space, text } from "../../src/theme";
import { useQueryClient } from "@tanstack/react-query";

export default function InterviewTab() {
  const qc = useQueryClient();
  const resumes = useResumes();
  const usage = useUsage();
  const sessions = useInterviewSessions();
  const [selected, setSelected] = useState<Resume | null>(null);

  const list = resumes.data ?? [];
  const active = selected ?? (list.length === 1 ? list[0] : null);
  const outOfMinutes = (usage.data?.available_seconds ?? 1) <= 0;

  const start = () => {
    if (!active) return;
    if (outOfMinutes) {
      router.push("/subscription?tab=refills");
      return;
    }
    router.push(`/interview/live/${active.id}`);
  };

  const deleteSession = (id: string) => {
    Alert.alert("Delete this interview?", "The report and recording will be removed.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          api
            .deleteInterviewSession(id)
            .then(() => {
              void qc.invalidateQueries({ queryKey: ["interview-sessions"] });
            })
            .catch(() => toast.error("Could not delete that interview."));
        },
      },
    ]);
  };

  return (
    <Screen
      testID="interview-screen"
      title="Live Interview"
      subtitle="Real-time voice practice with AI."
      refreshing={sessions.isRefetching}
      onRefresh={() => {
        void qc.invalidateQueries({ queryKey: ["interview-sessions"] });
        void qc.invalidateQueries({ queryKey: ["usage"] });
      }}
    >
      {usage.data ? (
        <View style={{ marginBottom: space.lg }}>
          <UsageMeter usage={usage.data} testID="interview-usage" />
        </View>
      ) : null}

      {!active ? (
        <ResumePicker
          resumes={list}
          loading={resumes.isLoading}
          onPick={setSelected}
          hint="Which resume should the AI interviewer read?"
        />
      ) : (
        <Card style={styles.hero} tint={color.primaryFaint}>
          <Text style={styles.orb}>🎙️</Text>
          <Text style={[text.title, { textAlign: "center" }]}>
            Ready when you are
          </Text>
          <Text style={[text.caption, { textAlign: "center" }]}>
            The AI interviewer reads “{active.title}” and asks progressively
            deeper questions. You get a scored report at the end.
          </Text>
          <Button
            testID="interview-start"
            label={outOfMinutes ? "Buy more minutes" : "Start interview"}
            variant="cta"
            size="lg"
            onPress={start}
          />
          {list.length > 1 ? (
            <Button
              label="Use a different resume"
              variant="ghost"
              size="sm"
              onPress={() => setSelected(null)}
            />
          ) : null}
          <Text style={[text.caption, { textAlign: "center", fontSize: 11.5 }]}>
            🎧 Tip: use headphones in a quiet room.
          </Text>
        </Card>
      )}

      <View style={styles.sectionHead}>
        <Text style={text.title}>Past interviews</Text>
      </View>

      {sessions.isLoading ? (
        <SkeletonCard lines={1} />
      ) : (sessions.data ?? []).length === 0 ? (
        <EmptyState
          emoji="🎤"
          title="No interviews yet"
          message="Your scored sessions will appear here."
        />
      ) : (
        <View style={{ gap: space.md }}>
          {(sessions.data ?? []).map((s) => (
            <Card
              key={s.id}
              onPress={() => router.push(`/interview/report/${s.id}`)}
            >
              <View style={styles.sessionRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={text.bodyMedium} numberOfLines={1}>
                    {s.resume_title || "Interview"}
                  </Text>
                  <Text style={text.caption}>
                    {new Date(s.created_at).toLocaleString()} ·{" "}
                    {fmtTime(s.duration_seconds || 0)}
                    {s.has_audio ? " · 🎧" : ""}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.sessionScore,
                    { color: scoreColor(s.overall_score ?? 0) },
                  ]}
                >
                  {s.overall_score ?? "—"}
                </Text>
                <Text style={styles.delete} onPress={() => deleteSession(s.id)}>
                  🗑️
                </Text>
              </View>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: "center", gap: space.md, paddingVertical: space.xxl },
  orb: { fontSize: 56 },
  sectionHead: { marginTop: space.xl, marginBottom: space.md },
  sessionRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  sessionScore: { fontFamily: fontFamily.displayBold, fontSize: 24 },
  delete: { fontSize: 18, padding: 4 },
});
