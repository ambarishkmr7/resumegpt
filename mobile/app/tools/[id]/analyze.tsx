import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../../src/api/client";
import { errorMessage } from "../../../src/api/errors";
import type { CareerAnalysis } from "../../../src/api/types";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import {
  Card,
  Chip,
  SkeletonCard,
  toast,
  ToastHost,
} from "../../../src/components/ui";
import { useResume } from "../../../src/hooks/queries";
import { color, space, text } from "../../../src/theme";

export default function AnalyzeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resume = useResume(id);
  const [result, setResult] = useState<CareerAnalysis | null>(null);
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (resume.data && !ran.current) {
      ran.current = true;
      api
        .analyze(resume.data.content, undefined, id)
        .then(setResult)
        .catch((e) => {
          setError(errorMessage(e));
          toast.error(errorMessage(e));
        });
    }
  }, [resume.data, id]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Career Analysis" />
      <ScrollView contentContainerStyle={styles.container}>
        {!result && !error ? (
          <>
            <Text style={[text.caption, { textAlign: "center" }]}>
              🔍 AI is reviewing your resume — ~15 seconds…
            </Text>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </>
        ) : null}
        {error ? (
          <Card tint={color.critSoft}>
            <Text style={text.body}>{error}</Text>
          </Card>
        ) : null}
        {result ? (
          <>
            {result.overall_assessment ? (
              <Card tint={color.primaryFaint} style={{ gap: 6 }}>
                <Text style={text.heading}>Overall assessment</Text>
                <Text style={text.body}>{result.overall_assessment}</Text>
              </Card>
            ) : null}

            {result.strengths.length > 0 ? (
              <Card style={{ gap: space.sm }}>
                <Text style={text.heading}>✅ Strengths</Text>
                {result.strengths.map((s, i) => (
                  <Text key={i} style={text.body}>
                    •  {s}
                  </Text>
                ))}
              </Card>
            ) : null}

            {result.weaknesses.length > 0 ? (
              <Card style={{ gap: space.md }}>
                <Text style={text.heading}>⚠️ Weaknesses</Text>
                {result.weaknesses.map((w, i) => (
                  <View key={i} style={{ gap: 4 }}>
                    <Chip
                      label={w.urgency}
                      tint={
                        w.urgency.startsWith("High")
                          ? color.critSoft
                          : w.urgency.startsWith("Low")
                            ? color.surfaceSunken
                            : color.warnSoft
                      }
                    />
                    <Text style={text.body}>{w.text}</Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {result.recommendations.length > 0 ? (
              <Card style={{ gap: space.md }}>
                <Text style={text.heading}>🎯 Recommendations</Text>
                {result.recommendations.map((r, i) => (
                  <View key={i} style={{ gap: 4 }}>
                    <Chip label={r.impact} tint={color.ctaSoft} textColor={color.ctaDark} />
                    <Text style={text.bodyMedium}>{r.text}</Text>
                    {r.why_it_matters ? (
                      <Text style={text.caption}>{r.why_it_matters}</Text>
                    ) : null}
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
});
