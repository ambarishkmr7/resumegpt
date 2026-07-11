import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../../src/api/client";
import { errorMessage } from "../../../src/api/errors";
import type { Resume, ResumeContent } from "../../../src/api/types";
import {
  AddButton,
  BulletEditor,
  ChipListEditor,
  RemovableItem,
  SectionCard,
  StarInput,
} from "../../../src/components/resume/editors";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import {
  Button,
  Chip,
  SkeletonCard,
  TextField,
  toast,
  ToastHost,
} from "../../../src/components/ui";
import { applyResumeUpdate, useResume } from "../../../src/hooks/queries";
import { useAutosave } from "../../../src/hooks/useAutosave";
import { useDownload } from "../../../src/hooks/useDownload";
import { useDeleteResume } from "../../../src/hooks/queries";
import { color, fontFamily, space, text } from "../../../src/theme";

export default function EditResume() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const query = useResume(id);
  const del = useDeleteResume();
  const { download, downloading } = useDownload();

  const [content, setContent] = useState<ResumeContent | null>(null);
  const loadedRef = useRef(false);

  const autosave = useAutosave<ResumeContent>(async (value) => {
    const updated = await api.updateResume(id!, { content: value } as Partial<Resume>);
    applyResumeUpdate(qc, updated);
  });

  useEffect(() => {
    if (query.data && !loadedRef.current) {
      setContent(query.data.content || {});
      loadedRef.current = true;
    }
  }, [query.data]);

  const update = (next: ResumeContent) => {
    setContent(next);
    autosave.markDirty(next);
  };

  const set = <K extends keyof ResumeContent>(key: K, value: ResumeContent[K]) =>
    update({ ...(content || {}), [key]: value });

  const doDownload = async (fmt: "pdf" | "docx") => {
    await autosave.flushNow();
    const { needsSub } = await download(id!, fmt, query.data?.title || "resume");
    if (needsSub) router.push("/subscription");
  };

  const chooseDownload = () => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ["Cancel", "PDF", "Word (DOCX)"], cancelButtonIndex: 0 },
        (i) => {
          if (i === 1) void doDownload("pdf");
          if (i === 2) void doDownload("docx");
        },
      );
    } else {
      Alert.alert("Download resume", "Choose a format", [
        { text: "PDF", onPress: () => void doDownload("pdf") },
        { text: "Word (DOCX)", onPress: () => void doDownload("docx") },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  };

  const confirmDelete = () => {
    Alert.alert("Delete this resume?", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          del.mutate(id!, {
            onSuccess: () => router.back(),
            onError: (e) => toast.error(errorMessage(e)),
          });
        },
      },
    ]);
  };

  const improve = async () => {
    if (!content) return;
    toast.show("✨ AI is improving your resume…");
    try {
      const res = await api.suggest(content);
      if (res.improved_content) {
        update(res.improved_content);
        toast.success("Resume improved — review the changes.");
      } else {
        toast.show("No changes suggested.");
      }
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (query.isLoading || !content) {
    return (
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        <BackHeader title="Resume" />
        <View style={{ padding: space.lg, gap: space.md }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </View>
      </View>
    );
  }

  const c = content.contact || {};
  const exp = content.experience || [];
  const edu = content.education || [];
  const proj = content.projects || [];
  const ratings = content.skill_ratings || [];
  const customs = content.custom_sections || [];

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: color.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <BackHeader
        title={query.data?.title || "Resume"}
        right={<SaveBadge state={autosave.state} />}
      />

      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        testID="editor-scroll"
      >
        <View style={styles.actionsRow}>
          <Chip
            label="🎯 ATS score"
            onPress={() => router.push(`/resume/${id}/ats`)}
            tint={color.primaryFaint}
            textColor={color.primaryDark}
          />
          <Chip
            label="👁️ Preview"
            onPress={() => router.push(`/resume/${id}/preview`)}
            tint={color.surfaceSunken}
          />
          <Chip
            label="🎨 Template"
            onPress={() => router.push(`/resume/${id}/templates`)}
            tint={color.surfaceSunken}
          />
        </View>

        <View style={{ gap: space.md }}>
          <SectionCard emoji="👤" title="Contact" initiallyOpen testID="section-contact">
            <TextField
              testID="contact-name"
              label="Full name"
              value={c.name || ""}
              onChangeText={(v) => set("contact", { ...c, name: v })}
            />
            <TextField
              label="Professional title"
              value={c.title || ""}
              onChangeText={(v) => set("contact", { ...c, title: v })}
            />
            <TextField
              label="Email"
              value={c.email || ""}
              autoCapitalize="none"
              keyboardType="email-address"
              onChangeText={(v) => set("contact", { ...c, email: v })}
            />
            <TextField
              label="Phone"
              value={c.phone || ""}
              keyboardType="phone-pad"
              onChangeText={(v) => set("contact", { ...c, phone: v })}
            />
            <TextField
              label="Location"
              value={c.location || ""}
              onChangeText={(v) => set("contact", { ...c, location: v })}
            />
            <TextField
              label="LinkedIn"
              value={c.linkedin || ""}
              autoCapitalize="none"
              onChangeText={(v) => set("contact", { ...c, linkedin: v })}
            />
          </SectionCard>

          <SectionCard emoji="📝" title="Summary" testID="section-summary">
            <TextField
              testID="summary-input"
              value={content.summary || ""}
              onChangeText={(v) => set("summary", v)}
              multiline
              placeholder="A punchy 3-4 line professional summary…"
            />
          </SectionCard>

          <SectionCard
            emoji="💼"
            title="Work history"
            count={exp.length}
            testID="section-experience"
          >
            {exp.map((e, i) => (
              <RemovableItem
                key={i}
                title={e.title || e.company || `Role ${i + 1}`}
                onRemove={() => set("experience", exp.filter((_, j) => j !== i))}
              >
                <TextField
                  label="Job title"
                  value={e.title || ""}
                  onChangeText={(v) => {
                    const a = [...exp];
                    a[i] = { ...e, title: v };
                    set("experience", a);
                  }}
                />
                <TextField
                  label="Company"
                  value={e.company || ""}
                  onChangeText={(v) => {
                    const a = [...exp];
                    a[i] = { ...e, company: v };
                    set("experience", a);
                  }}
                />
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Start"
                      value={e.start || ""}
                      placeholder="Jan 2022"
                      onChangeText={(v) => {
                        const a = [...exp];
                        a[i] = { ...e, start: v };
                        set("experience", a);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="End"
                      value={e.end || ""}
                      placeholder="Present"
                      onChangeText={(v) => {
                        const a = [...exp];
                        a[i] = { ...e, end: v };
                        set("experience", a);
                      }}
                    />
                  </View>
                </View>
                <Text style={text.label}>Bullets</Text>
                <BulletEditor
                  items={e.bullets || []}
                  onChange={(b) => {
                    const a = [...exp];
                    a[i] = { ...e, bullets: b };
                    set("experience", a);
                  }}
                />
              </RemovableItem>
            ))}
            <AddButton
              testID="add-role"
              label="+ Add role"
              onPress={() =>
                set("experience", [
                  ...exp,
                  { title: "", company: "", location: "", start: "", end: "", bullets: [""] },
                ])
              }
            />
          </SectionCard>

          <SectionCard emoji="🎓" title="Education" count={edu.length}>
            {edu.map((e, i) => (
              <RemovableItem
                key={i}
                title={e.degree || e.school || `Education ${i + 1}`}
                onRemove={() => set("education", edu.filter((_, j) => j !== i))}
              >
                <TextField
                  label="Degree"
                  value={e.degree || ""}
                  onChangeText={(v) => {
                    const a = [...edu];
                    a[i] = { ...e, degree: v };
                    set("education", a);
                  }}
                />
                <TextField
                  label="School"
                  value={e.school || ""}
                  onChangeText={(v) => {
                    const a = [...edu];
                    a[i] = { ...e, school: v };
                    set("education", a);
                  }}
                />
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Start"
                      value={e.start || ""}
                      onChangeText={(v) => {
                        const a = [...edu];
                        a[i] = { ...e, start: v };
                        set("education", a);
                      }}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="End"
                      value={e.end || ""}
                      onChangeText={(v) => {
                        const a = [...edu];
                        a[i] = { ...e, end: v };
                        set("education", a);
                      }}
                    />
                  </View>
                </View>
              </RemovableItem>
            ))}
            <AddButton
              label="+ Add education"
              onPress={() =>
                set("education", [
                  ...edu,
                  { degree: "", school: "", location: "", start: "", end: "", details: "" },
                ])
              }
            />
          </SectionCard>

          <SectionCard emoji="⭐" title="Skills" count={ratings.length}>
            {ratings.map((r, i) => (
              <View key={i} style={styles.skillRow}>
                <View style={{ flex: 1 }}>
                  <TextField
                    value={r.name}
                    placeholder="Skill name"
                    onChangeText={(v) => {
                      const a = [...ratings];
                      a[i] = { ...r, name: v };
                      set("skill_ratings", a);
                    }}
                  />
                </View>
                <StarInput
                  rating={r.rating}
                  onChange={(n) => {
                    const a = [...ratings];
                    a[i] = { ...r, rating: n };
                    set("skill_ratings", a);
                  }}
                />
                <Text
                  style={styles.removeSkill}
                  onPress={() => set("skill_ratings", ratings.filter((_, j) => j !== i))}
                >
                  ×
                </Text>
              </View>
            ))}
            <AddButton
              label="+ Add skill"
              onPress={() => set("skill_ratings", [...ratings, { name: "", rating: 3 }])}
            />
          </SectionCard>

          <SectionCard emoji="🧩" title="Core competencies" count={(content.core_competencies || []).length}>
            <ChipListEditor
              items={content.core_competencies || []}
              onChange={(l) => set("core_competencies", l)}
              placeholder="Add competency…"
            />
          </SectionCard>

          <SectionCard emoji="📜" title="Certifications" count={(content.certifications || []).length}>
            <ChipListEditor
              items={content.certifications || []}
              onChange={(l) => set("certifications", l)}
              placeholder="Add certification…"
            />
          </SectionCard>

          <SectionCard emoji="🚧" title="Projects" count={proj.length}>
            {proj.map((p, i) => (
              <RemovableItem
                key={i}
                title={p.name || `Project ${i + 1}`}
                onRemove={() => set("projects", proj.filter((_, j) => j !== i))}
              >
                <TextField
                  label="Name"
                  value={p.name || ""}
                  onChangeText={(v) => {
                    const a = [...proj];
                    a[i] = { ...p, name: v };
                    set("projects", a);
                  }}
                />
                <TextField
                  label="Description"
                  value={p.description || ""}
                  multiline
                  onChangeText={(v) => {
                    const a = [...proj];
                    a[i] = { ...p, description: v };
                    set("projects", a);
                  }}
                />
                <BulletEditor
                  items={p.bullets || []}
                  onChange={(b) => {
                    const a = [...proj];
                    a[i] = { ...p, bullets: b };
                    set("projects", a);
                  }}
                />
              </RemovableItem>
            ))}
            <AddButton
              label="+ Add project"
              onPress={() =>
                set("projects", [...proj, { name: "", description: "", bullets: [""] }])
              }
            />
          </SectionCard>

          <SectionCard emoji="🏆" title="Accomplishments" count={(content.accomplishments || []).length}>
            <ChipListEditor
              items={content.accomplishments || []}
              onChange={(l) => set("accomplishments", l)}
              placeholder="Add accomplishment…"
            />
          </SectionCard>

          <SectionCard emoji="🌐" title="Languages" count={(content.languages || []).length}>
            <ChipListEditor
              items={content.languages || []}
              onChange={(l) => set("languages", l)}
              placeholder="Add language…"
            />
          </SectionCard>

          <SectionCard emoji="🧱" title="Custom sections" count={customs.length}>
            {customs.map((cs, ci) => (
              <RemovableItem
                key={ci}
                title={cs.title}
                onRemove={() => set("custom_sections", customs.filter((_, j) => j !== ci))}
              >
                <TextField
                  label="Section title"
                  value={cs.title}
                  onChangeText={(v) => {
                    const a = [...customs];
                    a[ci] = { ...cs, title: v };
                    set("custom_sections", a);
                  }}
                />
                <ChipListEditor
                  items={cs.items}
                  onChange={(items) => {
                    const a = [...customs];
                    a[ci] = { ...cs, items };
                    set("custom_sections", a);
                  }}
                  placeholder="Add item…"
                />
              </RemovableItem>
            ))}
            <AddButton
              label="+ Add custom section"
              onPress={() =>
                set("custom_sections", [...customs, { title: "Custom Section", items: [] }])
              }
            />
          </SectionCard>
        </View>

        <View style={{ gap: space.md, marginTop: space.xl }}>
          <Button
            testID="editor-improve"
            label="✨ Improve with AI"
            variant="primary"
            onPress={() => void improve()}
          />
          <Button
            testID="editor-download"
            label="⬇️ Download PDF / DOCX"
            variant="cta"
            loading={downloading !== null}
            onPress={chooseDownload}
          />
          <Button label="🗑️ Delete resume" variant="ghost" onPress={confirmDelete} />
        </View>
      </ScrollView>
      <ToastHost />
    </KeyboardAvoidingView>
  );
}

function SaveBadge({ state }: { state: string }) {
  const label =
    state === "saving"
      ? "Saving…"
      : state === "saved"
        ? "Saved ✓"
        : state === "dirty"
          ? "…"
          : state === "error"
            ? "Save failed"
            : "";
  if (!label) return null;
  return (
    <Text
      testID="save-badge"
      style={{
        fontFamily: fontFamily.bodyMedium,
        fontSize: 12.5,
        color: state === "error" ? color.crit : color.inkSoft,
      }}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, paddingBottom: 60 },
  actionsRow: {
    flexDirection: "row",
    gap: space.sm,
    marginBottom: space.lg,
    flexWrap: "wrap",
  },
  twoCol: { flexDirection: "row", gap: space.md },
  skillRow: { flexDirection: "row", alignItems: "center", gap: space.sm },
  removeSkill: { fontSize: 22, color: color.inkFaint, paddingHorizontal: 4 },
});
