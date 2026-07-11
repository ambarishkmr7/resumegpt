import { router, useLocalSearchParams } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../../src/api/client";
import { errorMessage } from "../../../src/api/errors";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import {
  Card,
  Screen,
  SkeletonCard,
  toast,
  ToastHost,
} from "../../../src/components/ui";
import {
  applyResumeUpdate,
  useResume,
  useTemplates,
} from "../../../src/hooks/queries";
import { color, radius, space, text } from "../../../src/theme";

export default function TemplatePicker() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const resume = useResume(id);
  const templates = useTemplates();
  const current = resume.data?.template_id;

  const pick = async (templateId: string) => {
    try {
      const updated = await api.updateResume(id!, { template_id: templateId });
      applyResumeUpdate(qc, updated);
      toast.success("Template applied");
      router.back();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Choose a template" />
      <Screen scroll padded>
        {templates.isLoading ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : (
          <View style={styles.grid}>
            {(templates.data ?? []).map((t) => {
              const selected = t.id === current;
              const accent = t.accent || color.primary;
              return (
                <Card
                  key={t.id}
                  style={{
                    ...styles.tile,
                    ...(selected
                      ? { borderColor: accent, borderWidth: 2 }
                      : null),
                  }}
                  onPress={() => void pick(t.id)}
                >
                  {/* Schematic thumbnail from template metadata */}
                  <View style={styles.thumb}>
                    <View style={[styles.thumbBar, { backgroundColor: accent }]} />
                    <View style={styles.thumbLine} />
                    <View style={[styles.thumbLine, { width: "60%" }]} />
                    <View style={[styles.thumbLine, { width: "75%" }]} />
                  </View>
                  <Text style={text.bodyMedium} numberOfLines={1}>
                    {t.name}
                    {t.photo ? " 📷" : ""}
                  </Text>
                  {selected ? (
                    <Text style={[text.caption, { color: accent }]}>✓ Current</Text>
                  ) : null}
                </Card>
              );
            })}
          </View>
        )}
      </Screen>
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space.md,
  },
  tile: { width: "47%", gap: 6 },
  thumb: {
    backgroundColor: color.bg,
    borderRadius: radius.sm,
    padding: space.sm,
    gap: 5,
    height: 90,
  },
  thumbBar: { height: 14, borderRadius: 4, width: "50%" },
  thumbLine: {
    height: 6,
    borderRadius: 3,
    backgroundColor: color.line,
    width: "90%",
  },
});
