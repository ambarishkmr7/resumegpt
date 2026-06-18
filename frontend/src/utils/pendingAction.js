import { api } from "../api/client.js";

/**
 * After a successful login or register, check sessionStorage for a pending
 * action that was saved before auth (Create Resume / Import PDF).
 * Executes the action and navigates to the editor directly.
 * Falls back to /dashboard if no pending action or on error.
 */
export async function resolvePendingAction(navigate) {
  const raw = sessionStorage.getItem("pending_action");
  if (!raw) { navigate("/dashboard"); return; }
  sessionStorage.removeItem("pending_action");
  try {
    const pending = JSON.parse(raw);
    if (pending.type === "create" && pending.title && pending.name) {
      const sample = await api.generateSample(pending.title, pending.years ?? 3, pending.name);
      const r = await api.createResume({
        title: `${pending.name} - ${pending.title}`,
        template_id: "modern",
        content: sample,
      });
      navigate(`/editor/${r.id}`);
    } else if (pending.type === "import" && pending.fileData && pending.fileName) {
      const res = await fetch(pending.fileData);
      const blob = await res.blob();
      const file = new File([blob], pending.fileName, { type: blob.type });
      const r = await api.uploadResume(file, pending.fileName.replace(/\.[^.]+$/, ""));
      navigate(`/editor/${r.id}`);
    } else {
      navigate("/dashboard");
    }
  } catch {
    navigate("/dashboard");
  }
}
