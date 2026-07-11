import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { api } from "../../../src/api/client";
import { errorMessage } from "../../../src/api/errors";
import { BackHeader } from "../../../src/components/ui/BackHeader";
import {
  Button,
  Card,
  TextField,
  toast,
  ToastHost,
} from "../../../src/components/ui";
import { useResume } from "../../../src/hooks/queries";
import { color, fontFamily, space, text } from "../../../src/theme";

export default function CoverLetterScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resume = useResume(id);
  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jd, setJd] = useState("");
  const [letter, setLetter] = useState("");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    if (!resume.data?.content) return;
    setBusy(true);
    try {
      const res = await api.coverLetter({
        content: resume.data.content,
        job_title: jobTitle || undefined,
        company: company || undefined,
        job_description: jd || undefined,
      });
      setLetter(res.cover_letter || "");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Cover Letter" />
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Card style={{ gap: space.md }}>
          <TextField
            label="Job title"
            value={jobTitle}
            onChangeText={setJobTitle}
            placeholder="Product Designer"
          />
          <TextField
            label="Company"
            value={company}
            onChangeText={setCompany}
            placeholder="Acme Corp"
          />
          <TextField
            label="Job description (optional)"
            value={jd}
            onChangeText={setJd}
            multiline
            placeholder="Paste the JD for a sharper letter…"
          />
          <Button
            label={letter ? "Regenerate" : "✉️ Generate cover letter"}
            variant="cta"
            loading={busy}
            onPress={() => void generate()}
          />
        </Card>

        {letter ? (
          <Card style={{ gap: space.md }}>
            <Text style={styles.letter}>{letter}</Text>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Button
                  label="📋 Copy"
                  variant="secondary"
                  size="sm"
                  onPress={() => {
                    void Clipboard.setStringAsync(letter);
                    toast.success("Copied to clipboard");
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label="📤 Share"
                  variant="ghost"
                  size="sm"
                  onPress={() => void Share.share({ message: letter })}
                />
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>
      <ToastHost />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.lg, paddingBottom: 60 },
  letter: {
    fontFamily: fontFamily.body,
    fontSize: 14.5,
    lineHeight: 22,
    color: color.ink,
  },
  row: { flexDirection: "row", gap: space.md },
});
