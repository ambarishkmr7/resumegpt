import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { ScrollView } from "react-native";
import { api } from "../../../src/api/client";
import { fmtTime } from "../../../src/audio/pcm";
import { ReportView } from "../../../src/components/interview/ReportView";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import { Button, Card, SkeletonCard } from "../../../src/components/ui";
import { color, space, text } from "../../../src/theme";

export default function SessionReport() {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const session = useQuery({
    queryKey: ["interview-session", sessionId],
    queryFn: () => api.getInterviewSession(sessionId!),
    enabled: !!sessionId,
  });

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Interview report" />
      <ScrollView contentContainerStyle={styles.container}>
        {session.isLoading ? (
          <>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={4} />
          </>
        ) : session.isError ? (
          <Card tint={color.critSoft}>
            <Text style={text.body}>Could not load that interview.</Text>
          </Card>
        ) : (
          <ReportView
            report={session.data?.report ?? null}
            durationSeconds={session.data?.duration_seconds}
            audioPlayer={
              session.data?.has_audio ? (
                <SessionAudioPlayer sessionId={sessionId!} />
              ) : undefined
            }
          />
        )}
      </ScrollView>
    </View>
  );
}

// Streams the stored recording (backend supports HTTP Range; token rides the
// query string since native players can't set headers).
function SessionAudioPlayer({ sessionId }: { sessionId: string }) {
  const player = useAudioPlayer({ uri: api.interviewAudioStreamUrl(sessionId) });
  const status = useAudioPlayerStatus(player);

  const playing = status.playing;
  const position = Math.floor(status.currentTime || 0);
  const duration = Math.floor(status.duration || 0);

  return (
    <Card style={{ gap: space.md }}>
      <Text style={text.heading}>🎧 Listen back</Text>
      <View style={styles.playerRow}>
        <Button
          label={playing ? "⏸ Pause" : "▶️ Play"}
          variant="secondary"
          size="sm"
          onPress={() => {
            if (playing) player.pause();
            else player.play();
          }}
        />
        <Text style={text.caption}>
          {fmtTime(position)}
          {duration > 0 ? ` / ${fmtTime(duration)}` : ""}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, paddingBottom: 60 },
  playerRow: { flexDirection: "row", alignItems: "center", gap: space.md },
});
