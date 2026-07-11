import { router } from "expo-router";
import { Text, View } from "react-native";
import type { Resume } from "../../api/types";
import { Card, EmptyState, SkeletonCard } from "../ui";
import { space, text } from "../../theme";

interface ResumePickerProps {
  resumes: Resume[] | undefined;
  loading: boolean;
  onPick: (resume: Resume) => void;
  hint?: string;
}

// Shared "choose a resume first" list used by the Interview and Tools tabs.
export function ResumePicker({ resumes, loading, onPick, hint }: ResumePickerProps) {
  if (loading) {
    return (
      <View style={{ gap: space.md }}>
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }
  if (!resumes || resumes.length === 0) {
    return (
      <EmptyState
        emoji="🗂️"
        title="You need a resume first"
        message="Create or import a resume, then come back here."
        actionLabel="Create a resume"
        onAction={() => router.push("/resume/new")}
      />
    );
  }
  return (
    <View style={{ gap: space.md }}>
      {hint ? <Text style={text.caption}>{hint}</Text> : null}
      {resumes.map((r, i) => (
        <Card key={r.id} testID={`picker-resume-${i}`} onPress={() => onPick(r)}>
          <Text style={text.heading} numberOfLines={1}>
            {r.title}
          </Text>
          <Text style={text.caption} numberOfLines={1}>
            {r.content?.contact?.title || "—"}
          </Text>
        </Card>
      ))}
    </View>
  );
}
