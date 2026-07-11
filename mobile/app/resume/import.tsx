import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import { BackHeader } from "../../src/components/ui/BackHeader";
import { Button, Card, toast } from "../../src/components/ui";
import { color, fontFamily, space, text } from "../../src/theme";

const MAX_MB = 10;

export default function ImportResume() {
  const qc = useQueryClient();
  const [file, setFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [uploading, setUploading] = useState(false);

  const pick = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    if ((asset.size ?? 0) > MAX_MB * 1024 * 1024) {
      toast.error(`File is too large — max ${MAX_MB} MB.`);
      return;
    }
    setFile(asset);
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const created = await api.uploadResume(
        { uri: file.uri, name: file.name, mimeType: file.mimeType },
        file.name.replace(/\.(pdf|docx)$/i, ""),
      );
      void qc.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Resume imported!");
      router.replace(`/resume/${created.id}/edit`);
    } catch (e) {
      toast.error(errorMessage(e));
      setUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Import resume" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.hero}>📄</Text>
        <Text style={[text.title, { textAlign: "center" }]}>
          Bring your existing resume
        </Text>
        <Text style={[text.caption, { textAlign: "center", marginBottom: space.lg }]}>
          Upload a PDF or DOCX (max {MAX_MB} MB) — AI parses it into an
          editable resume.
        </Text>

        <Card testID="import-pick" onPress={() => void pick()} style={styles.dropzone}>
          {file ? (
            <>
              <Text style={styles.fileEmoji}>
                {file.name.toLowerCase().endsWith(".pdf") ? "📕" : "📘"}
              </Text>
              <Text style={text.bodyMedium} numberOfLines={1}>
                {file.name}
              </Text>
              <Text style={text.caption}>
                {((file.size ?? 0) / 1024 / 1024).toFixed(1)} MB · tap to change
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.fileEmoji}>⬆️</Text>
              <Text style={text.bodyMedium}>Tap to choose a file</Text>
              <Text style={text.caption}>PDF or DOCX</Text>
            </>
          )}
        </Card>

        <Button
          testID="import-upload"
          label={uploading ? "Parsing with AI…" : "Import & parse"}
          variant="cta"
          size="lg"
          disabled={!file}
          loading={uploading}
          onPress={() => void upload()}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.xl, gap: space.md },
  hero: { fontSize: 52, textAlign: "center" },
  dropzone: {
    alignItems: "center",
    paddingVertical: space.xxl,
    gap: 6,
    borderStyle: "dashed",
    borderWidth: 1.5,
    borderColor: color.lineStrong,
  },
  fileEmoji: { fontSize: 40 },
});
