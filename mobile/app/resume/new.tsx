import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import { useAuth } from "../../src/auth/store";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, TextField, toast } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

const STEPS = [
  "Reading your details…",
  "Drafting your experience…",
  "Polishing bullet points…",
  "Almost there…",
];

export default function NewResume() {
  const qc = useQueryClient();
  const user = useAuth((s) => s.user);
  const [name, setName] = useState(user?.full_name || "");
  const [title, setTitle] = useState("");
  const [years, setYears] = useState("");
  const [error, setError] = useState("");
  const [generating, setGenerating] = useState(false);
  const [step, setStep] = useState(0);

  const create = async () => {
    if (!name.trim() || !title.trim()) {
      setError("Add your name and target role.");
      return;
    }
    setError("");
    setGenerating(true);
    const stepTimer = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      2500,
    );
    try {
      const sample = await api.generateSample(
        title.trim(),
        Math.max(0, parseInt(years, 10) || 0),
        name.trim(),
      );
      const created = await api.createResume({
        title: `${title.trim()} Resume`,
        content: sample.content,
      });
      void qc.invalidateQueries({ queryKey: ["resumes"] });
      router.replace(`/resume/${created.id}/edit`);
    } catch (e) {
      toast.error(errorMessage(e));
      setGenerating(false);
      setStep(0);
    } finally {
      clearInterval(stepTimer);
    }
  };

  if (generating) return <GeneratingView step={step} />;

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="New resume" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.hero}>✨</Text>
        <Text style={[text.title, { textAlign: "center" }]}>
          Tell us about you
        </Text>
        <Text style={[text.caption, { textAlign: "center", marginBottom: space.lg }]}>
          AI drafts a complete first version — you fine-tune it after.
        </Text>
        <TextField
          testID="new-name"
          label="Your name"
          value={name}
          onChangeText={setName}
          placeholder="Priya Sharma"
        />
        <TextField
          testID="new-title"
          label="Target role"
          value={title}
          onChangeText={setTitle}
          placeholder="Product Designer"
          error={error}
        />
        <TextField
          testID="new-years"
          label="Years of experience"
          value={years}
          onChangeText={setYears}
          keyboardType="number-pad"
          placeholder="3"
        />
        <Button
          testID="new-submit"
          label="Generate my resume"
          variant="cta"
          size="lg"
          onPress={() => void create()}
        />
      </ScrollView>
    </View>
  );
}

function GeneratingView({ step }: { step: number }) {
  const spin = useSharedValue(0);
  spin.value = withRepeat(
    withTiming(360, { duration: 1400, easing: Easing.linear }),
    -1,
  );
  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }));
  return (
    <View style={styles.genWrap} testID="generating-view">
      <Animated.Text style={[styles.genEmoji, style]}>✨</Animated.Text>
      <Text style={styles.genTitle}>Writing your resume</Text>
      <Text style={[text.caption, { fontSize: 14 }]}>{STEPS[step]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.md },
  hero: { fontSize: 52, textAlign: "center" },
  genWrap: {
    flex: 1,
    backgroundColor: color.bg,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
  },
  genEmoji: { fontSize: 64 },
  genTitle: {
    fontFamily: fontFamily.displayBold,
    fontSize: 26,
    color: color.ink,
  },
});
