import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "../api/client";
import type { Resume } from "../api/types";
import { useAuth } from "../auth/store";

export function useResumes() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ["resumes"],
    queryFn: api.listResumes,
    enabled: !!token,
  });
}

export function useResume(id: string | undefined) {
  return useQuery({
    queryKey: ["resume", id],
    queryFn: () => api.getResume(id!),
    enabled: !!id,
  });
}

export function useTemplates() {
  return useQuery({
    queryKey: ["templates"],
    queryFn: api.templates,
    staleTime: Infinity,
  });
}

export function useUsage() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ["usage"],
    queryFn: api.usageSummary,
    enabled: !!token,
  });
}

export function useSubscriptionStatus() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ["subscription"],
    queryFn: api.subscriptionStatus,
    enabled: !!token,
  });
}

export function useProfile() {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ["profile"],
    queryFn: api.getProfile,
    enabled: !!token,
  });
}

export function useInterviewSessions(resumeId?: string) {
  const token = useAuth((s) => s.token);
  return useQuery({
    queryKey: ["interview-sessions", resumeId ?? "all"],
    queryFn: () => api.listInterviewSessions(resumeId),
    enabled: !!token,
  });
}

export function useDeleteResume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteResume(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["resumes"] }),
  });
}

// Optimistically merge an updated resume into caches after a save.
export function applyResumeUpdate(
  qc: ReturnType<typeof useQueryClient>,
  updated: Resume,
) {
  qc.setQueryData(["resume", updated.id], updated);
  qc.setQueryData<Resume[]>(["resumes"], (prev) =>
    prev?.map((r) => (r.id === updated.id ? updated : r)),
  );
}
