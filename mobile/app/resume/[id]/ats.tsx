import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../../src/api/client";
import { errorMessage } from "../../../src/api/errors";
import type { AtsResult } from "../../../src/api/types";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import {
  Button,
  Card,
  Chip,
  ScoreRing,
  Skeleton,
  TextField,
  toast,
  ToastHost,
} from "../../../src/components/ui";
import { useResume } from "../../../src/hooks/queries";
import { color, space, text } from "../../../src/theme";

const SEVERITY_TINT: Record<string, string> = {
  critical: color.critSoft,
  warning: color.warnSoft,
  info: color.surfaceSunken,
};

export default function AtsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resume = useResume(id);
  const [jd, setJd] = useState("");
  const [result, setResult] = useState<AtsResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const ranInitial = useRef(false);

  const rescore = async (jobDescription?: string) => {
    if (!resume.data?.content) return;
    setScoring(true);
    try {
      const res = await api.ats(resume.data.content, jobDescription);
      setResult(res);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setScoring(false);
    }
  };

  // Score once against no JD as soon as the resume loads.
  useEffect(() => {
    if (resume.data && !ranInitial.current) {
      ranInitial.current = true;
      void rescore();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resume.data]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="ATS Score" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.ringWrap} testID="ats-ring">
          {scoring || !result ? (
            <Skeleton width={140} height={140} round={70} />
          ) : (
            <ScoreRing score={result.score} size={140} />
          )}
          <Text style={[text.caption, { textAlign: "center" }]}>
            How well your resume passes automated screeners.
          </Text>
        </View>

        <Card style={{ gap: space.md }}>
          <Text style={text.heading}>Score against a job</Text>
          <TextField
            testID="ats-jd"
            value={jd}
            onChangeText={setJd}
            multiline
            placeholder="Paste a job description to get keyword-matched scoring…"
          />
          <Button
            testID="ats-rescore"
            label="Rescore"
            loading={scoring}
            onPress={() => void rescore(jd || undefined)}
          />
        </Card>

        {result ? (
          <>
            {result.matched_keywords.length > 0 || result.missing_keywords.length > 0 ? (
              <Card style={{ gap: space.md }}>
                <Text style={text.heading}>Keywords</Text>
                {result.matched_keywords.length > 0 ? (
                  <View style={{ gap: space.sm }}>
                    <Text style={text.caption}>✓ Matched</Text>
                    <View style={styles.chipWrap}>
                      {result.matched_keywords.map((k, i) => (
                        <Chip key={i} label={k} tint={color.goodSoft} textColor={color.good} />
                      ))}
                    </View>
                  </View>
                ) : null}
                {result.missing_keywords.length > 0 ? (
                  <View style={{ gap: space.sm }}>
                    <Text style={text.caption}>✗ Missing</Text>
                    <View style={styles.chipWrap}>
                      {result.missing_keywords.map((k, i) => (
                        <Chip key={i} label={k} tint={color.critSoft} textColor={color.crit} />
                      ))}
                    </View>
                  </View>
                ) : null}
              </Card>
            ) : null}

            {Object.keys(result.breakdown || {}).length > 0 ? (
              <Card style={{ gap: space.sm }}>
                <Text style={text.heading}>Breakdown</Text>
                {Object.entries(result.breakdown).map(([cat, pts]) => (
                  <View key={cat} style={styles.breakRow}>
                    <Text style={text.body}>{cat}</Text>
                    <Text style={text.bodyMedium}>{String(pts)}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {result.issues.length > 0 ? (
              <Card style={{ gap: space.md }}>
                <Text style={text.heading}>Fix these</Text>
                {result.issues.map((issue, i) => (
                  <View
                    key={i}
                    style={[
                      styles.issue,
                      { backgroundColor: SEVERITY_TINT[issue.severity] || color.surfaceSunken },
                    ]}
                  >
                    <Text style={text.label}>
                      {issue.severity === "critical"
                        ? "🔴"
                        : issue.severity === "warning"
                          ? "🟡"
                          : "ℹ️"}{" "}
                      {issue.category}
                    </Text>
                    <Text style={text.body}>{issue.message}</Text>
                    <Text style={text.caption}>💡 {issue.suggestion}</Text>
                  </View>
                ))}
              </Card>
            ) : null}
          </>
        ) : null}
      </ScrollView>
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, paddingBottom: 60 },
  ringWrap: { alignItems: "center", gap: space.md, marginTop: space.md },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  breakRow: { flexDirection: "row", justifyContent: "space-between" },
  issue: { borderRadius: 12, padding: space.md, gap: 4 },
});
