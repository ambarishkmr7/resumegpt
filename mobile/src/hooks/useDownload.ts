import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { api, authHeaders } from "../api/client";
import { errorMessage } from "../api/errors";
import { toast } from "../components/ui";

// Downloads a resume as PDF/DOCX and opens the native share sheet.
// Returns needsSub=true on HTTP 402 so the caller can open the paywall.
export function useDownload() {
  const [downloading, setDownloading] = useState<"pdf" | "docx" | null>(null);

  const download = async (
    id: string,
    fmt: "pdf" | "docx",
    title: string,
  ): Promise<{ needsSub: boolean }> => {
    setDownloading(fmt);
    try {
      const safeName = `${title.replace(/[^\w\- ]+/g, "").trim() || "resume"}.${fmt}`;
      const target = `${FileSystem.cacheDirectory}${safeName}`;
      const result = await FileSystem.downloadAsync(
        api.downloadUrl(id, fmt),
        target,
        { headers: { ...authHeaders() } },
      );
      if (result.status === 402) return { needsSub: true };
      if (result.status !== 200) throw new Error(`Download failed (${result.status})`);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(result.uri, {
          mimeType:
            fmt === "pdf"
              ? "application/pdf"
              : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          dialogTitle: safeName,
        });
      } else {
        toast.success(`Saved to ${result.uri}`);
      }
      return { needsSub: false };
    } catch (e) {
      toast.error(errorMessage(e));
      return { needsSub: false };
    } finally {
      setDownloading(null);
    }
  };

  return { download, downloading };
}
