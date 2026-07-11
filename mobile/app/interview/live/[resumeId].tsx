import { useKeepAwake } from "expo-keep-awake";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fmtTime } from "../../../src/audio/pcm";
import { ReportView } from "../../../src/components/interview/ReportView";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Button, Card } from "../../../src/components/ui";
import { useLiveInterview } from "../../../src/interview/useLiveInterview";
import { color, fontFamily, space, text } from "../../../src/theme";

export default function LiveInterviewScreen() {
  const { resumeId } = useLocalSearchParams<{ resumeId: string }>();
  const insets = useSafeAreaInsets();
  const live = useLiveInterview(resumeId!);
  useKeepAwake();

  // Auto-start once on mount.
  useEffect(() => {
    void live.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Out of minutes → bounce to the paywall.
  useEffect(() => {
    if (live.needsPaywall) {
      live.clearPaywall();
      router.replace("/subscription?tab=refills");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.needsPaywall]);

  if (live.phase === "report") {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <BackHeader title="Interview report" />
        <ScrollView contentContainerStyle={styles.reportWrap}>
          <ReportView
            report={live.result?.report ?? null}
            durationSeconds={live.result?.durationSeconds}
          />
          <View style={{ gap: space.md, marginTop: space.lg }}>
            <Button
              testID="report-again"
              label="🎙️ Start another"
              variant="cta"
              onPress={() => void live.start()}
            />
            <Button label="Done" variant="ghost" onPress={() => router.back()} />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (live.phase === "error") {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <BackHeader title="Live interview" />
        <View style={styles.centered}>
          <Text style={styles.orbStatic}>😕</Text>
          <Card tint={color.critSoft}>
            <Text style={text.body} testID="live-error">
              {live.error}
            </Text>
          </Card>
          <Button label="Try again" variant="cta" onPress={() => void live.start()} />
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const connecting = live.phase === "connecting" || live.phase === "idle";

  return (
    <View
      style={[styles.liveRoot, { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xl }]}
      testID="live-screen"
    >
      <Text style={styles.liveTitle}>🎙️ Live Mock Interview</Text>

      <View style={styles.centerBlock}>
        <VoiceOrb speaking={live.aiSpeaking} connecting={connecting} />
        <Text style={styles.status} testID="live-status">
          {live.statusLine || "Connecting…"}
        </Text>
        <Text style={styles.timer} testID="live-timer">
          {fmtTime(live.elapsed)}
          <Text style={styles.timerMax}> / {fmtTime(live.capSeconds)}</Text>
        </Text>
      </View>

      <View style={styles.controls}>
        <Button
          testID="live-mute"
          label={live.muted ? "🔇 Unmute" : "🎤 Mute"}
          variant={live.muted ? "primary" : "ghost"}
          onPress={() => live.setMuted(!live.muted)}
          style={{ flex: 1 }}
        />
        <Button
          testID="live-end"
          label="End interview"
          variant="danger"
          disabled={live.phase === "ending"}
          loading={live.phase === "ending"}
          onPress={live.end}
          style={{ flex: 1 }}
        />
      </View>
      <Text style={[text.caption, { textAlign: "center" }]}>
        Speak naturally — the AI follows up on your answers.
      </Text>
    </View>
  );
}

function VoiceOrb({ speaking, connecting }: { speaking: boolean; connecting: boolean }) {
  const pulse = useSharedValue(1);
  const scale = useSharedValue(1);

  useEffect(() => {
    pulse.value = withRepeat(withTiming(1.16, { duration: 900 }), -1, true);
  }, [pulse]);

  useEffect(() => {
    scale.value = withSpring(speaking ? 1.12 : 1, { damping: 10 });
  }, [speaking, scale]);

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));
  const coreStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <View style={styles.orbWrap}>
      <Animated.View
        style={[
          styles.orbHalo,
          haloStyle,
          speaking && { backgroundColor: color.primarySoft },
        ]}
      />
      <Animated.View
        style={[
          styles.orbCore,
          coreStyle,
          speaking && { backgroundColor: color.primary },
          connecting && { opacity: 0.6 },
        ]}
      >
        <Text style={{ fontSize: 44 }}>🎙️</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  liveRoot: {
    flex: 1,
    backgroundColor: color.bg,
    paddingHorizontal: space.xl,
    justifyContent: "space-between",
  },
  liveTitle: {
    fontFamily: fontFamily.displayBold,
    fontSize: 20,
    color: color.ink,
    textAlign: "center",
  },
  centerBlock: { alignItems: "center", gap: space.lg },
  orbWrap: { width: 180, height: 180, alignItems: "center", justifyContent: "center" },
  orbHalo: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    backgroundColor: color.ctaSoft,
  },
  orbCore: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: color.cta,
    alignItems: "center",
    justifyContent: "center",
  },
  status: {
    fontFamily: fontFamily.bodyMedium,
    fontSize: 16,
    color: color.inkSoft,
  },
  timer: {
    fontFamily: fontFamily.displayBold,
    fontSize: 40,
    color: color.ink,
  },
  timerMax: { fontSize: 20, color: color.inkFaint },
  controls: { flexDirection: "row", gap: space.md },
  centered: {
    flex: 1,
    justifyContent: "center",
    padding: space.xl,
    gap: space.lg,
  },
  orbStatic: { fontSize: 56, textAlign: "center" },
  reportWrap: { padding: space.lg, paddingBottom: 60 },
});
