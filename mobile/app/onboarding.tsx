import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "../src/components/ui";
import { color, fontFamily, radius, space } from "../src/theme";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    emoji: "📝",
    title: "Build a resume that gets noticed",
    body: "AI-crafted resumes with live ATS scoring, beautiful templates, and one-tap improvements.",
  },
  {
    emoji: "🎙️",
    title: "Practice with a live AI interviewer",
    body: "A real-time voice interview based on your resume — with a scored report at the end.",
  },
  {
    emoji: "🚀",
    title: "Land your next role faster",
    body: "Career analysis, learning roadmaps, and tailored cover letters — all in one place.",
  },
];

async function finish(to: "/(auth)/login" | "/(auth)/register") {
  await AsyncStorage.setItem("seen_onboarding", "1");
  router.replace(to);
}

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const [page, setPage] = useState(0);
  const listRef = useRef<FlatList>(null);
  const last = page === SLIDES.length - 1;

  return (
    <LinearGradient
      colors={[color.bg, color.primaryFaint]}
      style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + space.xl }]}
    >
      <View style={styles.skipRow}>
        <Pressable onPress={() => void finish("/(auth)/login")} hitSlop={12}>
          <Text style={styles.skip} testID="onboarding-skip">
            Skip
          </Text>
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.title}
        onMomentumScrollEnd={(e) =>
          setPage(Math.round(e.nativeEvent.contentOffset.x / width))
        }
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Animated.Text entering={FadeInUp.springify()} style={styles.emoji}>
              {item.emoji}
            </Animated.Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>

      <View style={styles.actions}>
        {last ? (
          <>
            <Button
              testID="onboarding-get-started"
              label="Get started free"
              variant="cta"
              size="lg"
              onPress={() => void finish("/(auth)/register")}
            />
            <Button
              label="I already have an account"
              variant="ghost"
              onPress={() => void finish("/(auth)/login")}
            />
          </>
        ) : (
          <Button
            testID="onboarding-next"
            label="Next"
            size="lg"
            onPress={() => {
              listRef.current?.scrollToIndex({ index: page + 1 });
              setPage(page + 1);
            }}
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  skipRow: { alignItems: "flex-end", paddingHorizontal: space.xl },
  skip: {
    fontFamily: fontFamily.bodySemiBold,
    fontSize: 14,
    color: color.inkSoft,
    padding: space.sm,
  },
  slide: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space.xxl,
    gap: space.lg,
  },
  emoji: { fontSize: 84 },
  title: {
    fontFamily: fontFamily.displayBold,
    fontSize: 30,
    lineHeight: 36,
    textAlign: "center",
    color: color.ink,
  },
  body: {
    fontFamily: fontFamily.body,
    fontSize: 16,
    lineHeight: 24,
    textAlign: "center",
    color: color.inkSoft,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    marginBottom: space.xl,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: color.line,
  },
  dotActive: { backgroundColor: color.primary, width: 22 },
  actions: { paddingHorizontal: space.xl, gap: space.md },
});
