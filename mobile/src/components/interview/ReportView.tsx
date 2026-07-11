import { StyleSheet, Text, View } from "react-native";
import type { InterviewReport } from "../../api/types";
import { fmtTime } from "../../audio/pcm";
import { color, radius, scoreColor, space, text } from "../../theme";
import { Card, ScoreRing } from "../ui";

interface ReportViewProps {
  report: InterviewReport | null;
  durationSeconds?: number;
  audioPlayer?: React.ReactNode;
}

// Scored interview report: ring, verdict, competency bars, notes.
export function ReportView({ report, durationSeconds, audioPlayer }: ReportViewProps) {
  if (!report) {
    return (
      <Card>
        <Text style={text.body}>
          The report for this session isn&apos;t available.
        </Text>
      </Card>
    );
  }
  const score = report.overall_score ?? 0;

  return (
    <View style={{ gap: space.lg }}>
      <View style={styles.head} testID="report-head">
        <ScoreRing score={score} size={130} />
        <Text style={[text.title, { textAlign: "center" }]}>
          {report.verdict || "Interview complete"}
        </Text>
        {report.summary ? (
          <Text style={[text.body, { textAlign: "center" }]}>{report.summary}</Text>
        ) : null}
        {durationSeconds != null ? (
          <Text style={text.caption}>Duration: {fmtTime(durationSeconds)}</Text>
        ) : null}
      </View>

      {audioPlayer}

      {(report.competencies ?? []).length > 0 ? (
        <Card style={{ gap: space.md }}>
          <Text style={text.heading}>Competencies</Text>
          {(report.competencies ?? []).map((c, i) => {
            const s = Math.max(0, Math.min(100, c.score ?? 0));
            return (
              <View key={i} style={{ gap: 4 }}>
                <View style={styles.compRow}>
                  <Text style={text.bodyMedium}>{c.name}</Text>
                  <Text style={[text.bodyMedium, { color: scoreColor(s) }]}>
                    {c.score ?? 0}
                  </Text>
                </View>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      { width: `${s}%`, backgroundColor: scoreColor(s) },
                    ]}
                  />
                </View>
                {c.note ? <Text style={text.caption}>{c.note}</Text> : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {(report.strengths ?? []).length > 0 ? (
        <Card tint={color.goodSoft} style={{ gap: space.sm }}>
          <Text style={text.heading}>✅ Strengths</Text>
          {(report.strengths ?? []).map((s, i) => (
            <Text key={i} style={text.body}>
              •  {s}
            </Text>
          ))}
        </Card>
      ) : null}

      {(report.weaknesses ?? []).length > 0 ? (
        <Card tint={color.warnSoft} style={{ gap: space.sm }}>
          <Text style={text.heading}>⚠️ Areas to improve</Text>
          {(report.weaknesses ?? []).map((s, i) => (
            <Text key={i} style={text.body}>
              •  {s}
            </Text>
          ))}
        </Card>
      ) : null}

      {(report.recommendations ?? []).length > 0 ? (
        <Card style={{ gap: space.sm }}>
          <Text style={text.heading}>🎯 Recommendations</Text>
          {(report.recommendations ?? []).map((s, i) => (
            <Text key={i} style={text.body}>
              •  {s}
            </Text>
          ))}
        </Card>
      ) : null}

      {(report.question_notes ?? []).length > 0 ? (
        <Card style={{ gap: space.md }}>
          <Text style={text.heading}>📋 Question-by-question</Text>
          {(report.question_notes ?? []).map((q, i) => (
            <View key={i} style={styles.qnote}>
              <Text style={text.bodyMedium}>{q.question}</Text>
              <Text style={text.caption}>{q.assessment}</Text>
            </View>
          ))}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { alignItems: "center", gap: space.sm },
  compRow: { flexDirection: "row", justifyContent: "space-between" },
  barTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: color.line,
    overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 4 },
  qnote: {
    backgroundColor: color.bg,
    borderRadius: radius.md,
    padding: space.md,
    gap: 4,
  },
});
