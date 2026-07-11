import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useQueryClient } from "@tanstack/react-query";
import { isGuest, useAuth } from "../../src/auth/store";
import {
  Button,
  Card,
  Chip,
  EmptyState,
  Screen,
  SkeletonCard,
  UsageMeter,
} from "../../src/components/ui";
import {
  useResumes,
  useSubscriptionStatus,
  useUsage,
} from "../../src/hooks/queries";
import { color, fontFamily, scoreColor, space, text } from "../../src/theme";

const MAX_RESUMES = 4;

export default function Home() {
  const user = useAuth((s) => s.user);
  const qc = useQueryClient();
  const resumes = useResumes();
  const usage = useUsage();
  const sub = useSubscriptionStatus();

  const firstName =
    (user?.full_name || "").split(" ")[0] || (isGuest(user) ? "there" : "there");
  const list = resumes.data ?? [];
  const atLimit = list.length >= MAX_RESUMES;

  return (
    <Screen
      testID="home-screen"
      title={`Hi ${firstName} 👋`}
      subtitle="Let's get you hired."
      headerRight={
        sub.data?.is_subscribed ? (
          <Chip label="⭐ Elite" tint={color.ctaSoft} textColor={color.ctaDark} />
        ) : undefined
      }
      refreshing={resumes.isRefetching}
      onRefresh={() => {
        void qc.invalidateQueries();
      }}
    >
      {isGuest(user) ? (
        <Card
          testID="guest-banner"
          tint={color.warnSoft}
          style={{ marginBottom: space.lg }}
          onPress={() => router.push("/(auth)/register" as never)}
        >
          <Text style={text.label}>💾 You&apos;re browsing as a guest</Text>
          <Text style={text.caption}>
            Create a free account to keep your resumes — tap here.
          </Text>
        </Card>
      ) : null}

      {usage.data ? (
        <View style={{ marginBottom: space.lg }}>
          <UsageMeter usage={usage.data} testID="usage-meter" />
        </View>
      ) : null}

      <View style={styles.ctaRow}>
        <Card
          testID="home-create"
          style={styles.ctaCard}
          tint={color.primaryFaint}
          onPress={() => router.push("/resume/new")}
        >
          <Text style={styles.ctaEmoji}>✨</Text>
          <Text style={text.heading}>Create resume</Text>
          <Text style={text.caption}>AI writes your first draft</Text>
        </Card>
        <Card
          testID="home-import"
          style={styles.ctaCard}
          tint={color.ctaSoft}
          onPress={() => router.push("/resume/import")}
        >
          <Text style={styles.ctaEmoji}>📄</Text>
          <Text style={text.heading}>Import</Text>
          <Text style={text.caption}>PDF or DOCX, parsed by AI</Text>
        </Card>
      </View>

      <View style={styles.sectionHead}>
        <Text style={text.title}>My resumes</Text>
        <Text style={text.caption}>
          {list.length}/{MAX_RESUMES}
        </Text>
      </View>

      {resumes.isLoading ? (
        <View style={{ gap: space.md }}>
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : resumes.isError ? (
        <EmptyState
          emoji="📡"
          title="Couldn't load your resumes"
          message="Check your connection and try again."
          actionLabel="Retry"
          onAction={() => void resumes.refetch()}
        />
      ) : list.length === 0 ? (
        <EmptyState
          testID="home-empty"
          emoji="🗂️"
          title="No resumes yet"
          message="Create one with AI or import an existing PDF/DOCX."
          actionLabel="Create my first resume"
          onAction={() => router.push("/resume/new")}
        />
      ) : (
        <View style={{ gap: space.md }}>
          {list.map((r, i) => (
            <Animated.View key={r.id} entering={FadeInDown.delay(i * 60)}>
              <Card
                testID={`resume-card-${i}`}
                onPress={() => router.push(`/resume/${r.id}/edit`)}
              >
                <View style={styles.resumeRow}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={text.heading} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={text.caption} numberOfLines={1}>
                      {r.content?.contact?.title || "—"}
                    </Text>
                    {r.updated_at ? (
                      <Text style={[text.caption, { fontSize: 11.5 }]}>
                        Updated {new Date(r.updated_at).toLocaleDateString()}
                      </Text>
                    ) : null}
                  </View>
                  {typeof r.ats_score === "number" ? (
                    <View style={styles.atsBadge}>
                      <Text
                        style={[
                          styles.atsScore,
                          { color: scoreColor(r.ats_score) },
                        ]}
                      >
                        {Math.round(r.ats_score)}
                      </Text>
                      <Text style={[text.micro]}>ATS</Text>
                    </View>
                  ) : null}
                </View>
              </Card>
            </Animated.View>
          ))}
          {atLimit ? (
            <Text style={[text.caption, { textAlign: "center" }]}>
              Resume limit reached ({MAX_RESUMES}). Delete one to add another.
            </Text>
          ) : null}
        </View>
      )}

      <View style={{ marginTop: space.xl }}>
        <Button
          testID="home-interview-cta"
          label="🎙️ Practice a live interview"
          variant="primary"
          size="lg"
          onPress={() => router.push("/(tabs)/interview")}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ctaRow: { flexDirection: "row", gap: space.md, marginBottom: space.xl },
  ctaCard: { flex: 1, gap: 4 },
  ctaEmoji: { fontSize: 28, marginBottom: 4 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: space.md,
  },
  resumeRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  atsBadge: { alignItems: "center" },
  atsScore: { fontFamily: fontFamily.displayBold, fontSize: 26 },
});
