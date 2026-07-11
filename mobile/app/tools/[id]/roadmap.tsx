import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../../../src/api/client";
import { errorMessage } from "../../../src/api/errors";
import type { CareerRoadmap } from "../../../src/api/types";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import {
  Card,
  Chip,
  SkeletonCard,
  toast,
  ToastHost,
} from "../../../src/components/ui";
import { useResume } from "../../../src/hooks/queries";
import { color, fontFamily, space, text } from "../../../src/theme";

export default function RoadmapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resume = useResume(id);
  const [result, setResult] = useState<CareerRoadmap | null>(null);
  const [error, setError] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (resume.data && !ran.current) {
      ran.current = true;
      api
        .roadmap(resume.data.content, undefined, id)
        .then(setResult)
        .catch((e) => {
          setError(errorMessage(e));
          toast.error(errorMessage(e));
        });
    }
  }, [resume.data, id]);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Career Roadmap" />
      <ScrollView contentContainerStyle={styles.container}>
        {!result && !error ? (
          <>
            <Text style={[text.caption, { textAlign: "center" }]}>
              🗺️ Charting your path — ~15 seconds…
            </Text>
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
          </>
        ) : null}
        {error ? (
          <Card tint={color.critSoft}>
            <Text style={text.body}>{error}</Text>
          </Card>
        ) : null}
        {result ? (
          <>
            <Card tint={color.primaryFaint} style={{ gap: 6 }}>
              <Text style={text.heading}>Where you are</Text>
              <Text style={text.body}>{result.current_level}</Text>
              {result.next_roles.length > 0 ? (
                <View style={styles.chipWrap}>
                  {result.next_roles.map((r, i) => (
                    <Chip key={i} label={`→ ${r}`} tint={color.primarySoft} textColor={color.primaryDark} />
                  ))}
                </View>
              ) : null}
              {result.timeline ? (
                <Text style={text.caption}>⏳ {result.timeline}</Text>
              ) : null}
            </Card>

            {result.roadmap_steps.length > 0 ? (
              <Card style={{ gap: space.md }}>
                <Text style={text.heading}>Your roadmap</Text>
                {result.roadmap_steps.map((s, i) => (
                  <View key={i} style={styles.step}>
                    <View style={styles.stepNum}>
                      <Text style={styles.stepNumText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <Text style={text.bodyMedium}>{s.text}</Text>
                      <Text style={text.caption}>
                        {[s.timeframe, s.category].filter(Boolean).join(" · ")}
                      </Text>
                      {s.explanation ? (
                        <Text style={text.caption}>{s.explanation}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </Card>
            ) : null}

            {result.skill_gaps.length > 0 ? (
              <Card style={{ gap: space.sm }}>
                <Text style={text.heading}>Skill gaps to close</Text>
                <View style={styles.chipWrap}>
                  {result.skill_gaps.map((s, i) => (
                    <Chip key={i} label={s} tint={color.warnSoft} />
                  ))}
                </View>
              </Card>
            ) : null}

            {result.recommended_certifications.length > 0 ? (
              <Card style={{ gap: space.md }}>
                <Text style={text.heading}>📜 Certifications</Text>
                {result.recommended_certifications.map((c, i) => (
                  <View key={i} style={{ gap: 2 }}>
                    <Text
                      style={[text.bodyMedium, c.udemy_url ? styles.link : null]}
                      onPress={
                        c.udemy_url
                          ? () => void Linking.openURL(c.udemy_url)
                          : undefined
                      }
                    >
                      {c.name}
                    </Text>
                    <Text style={text.caption}>
                      {[c.institution, c.description].filter(Boolean).join(" — ")}
                    </Text>
                  </View>
                ))}
              </Card>
            ) : null}

            {result.youtube_channels.length > 0 ? (
              <Card style={{ gap: space.sm }}>
                <Text style={text.heading}>📺 YouTube channels</Text>
                {result.youtube_channels.map((y, i) => (
                  <Text
                    key={i}
                    style={[text.body, y.url ? styles.link : null]}
                    onPress={y.url ? () => void Linking.openURL(y.url) : undefined}
                  >
                    •  {y.name}
                    {y.topic ? ` — ${y.topic}` : ""}
                  </Text>
                ))}
              </Card>
            ) : null}

            {result.learning_resources.length > 0 ? (
              <Card style={{ gap: space.sm }}>
                <Text style={text.heading}>📚 Learning resources</Text>
                {result.learning_resources.map((l, i) => (
                  <Text
                    key={i}
                    style={[text.body, l.url ? styles.link : null]}
                    onPress={l.url ? () => void Linking.openURL(l.url) : undefined}
                  >
                    •  {l.platform}
                    {l.description ? ` — ${l.description}` : ""}
                  </Text>
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
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 4 },
  step: { flexDirection: "row", gap: space.md },
  stepNum: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  stepNumText: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 13,
    color: color.primaryDark,
  },
  link: { color: color.primary, textDecorationLine: "underline" },
});
