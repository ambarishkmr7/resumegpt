import { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "../src/api/client";
import { errorMessage } from "../src/api/errors";
import type { JobListing, JobListingsResponse, ResumeContent } from "../src/api/types";
import { ChipListEditor } from "../src/components/resume/editors";
import { BackHeader } from "../src/components/ui/BackHeader";
import { Button, Card, Chip, EmptyState, SkeletonCard, TextField, toast } from "../src/components/ui";
import { useProfile, useResumes } from "../src/hooks/queries";
import { color, fontFamily, radius, space, text } from "../src/theme";
import { safeOpenUrl } from "../src/utils/safeOpenUrl";

const SOURCE_COLORS: Record<string, string> = {
  LinkedIn: "#0077b5",
  Naukri: "#ff7555",
  Indeed: "#2557a7",
  Monster: "#6600cc",
  Shine: "#e25c00",
  "Remote.com": "#16a34a",
  Crossover: "#7c3aed",
  "Remote.co": "#0891b2",
};

// Rebuild a ResumeContent shape from the profile record — mirrors
// frontend/src/pages/JobsPage.jsx's buildContentFromProfile().
function buildContentFromProfile(
  profile: ReturnType<typeof useProfile>["data"],
): ResumeContent | null {
  if (!profile) return null;
  return {
    contact: {
      name: profile.personal?.full_name || "",
      title: profile.personal?.headline || profile.preferences?.desired_role || "",
      email: profile.personal?.email || "",
      phone: profile.personal?.phone || "",
      location: profile.personal?.location || "",
      linkedin: profile.personal?.linkedin_url || "",
    },
    summary: profile.personal?.summary || "",
    skills: profile.skills || [],
    experience: (profile.experience || []).map((e) => ({
      title: e.title || "",
      company: e.company || "",
      start: e.start_date || "",
      end: e.current ? "Present" : e.end_date || "",
      bullets: e.description ? [e.description] : [],
    })),
    education: [],
  };
}

export default function JobsScreen() {
  const profile = useProfile();
  const resumes = useResumes();
  const dataReady = profile.isFetched && resumes.isFetched;

  const [targetRole, setTargetRole] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [listings, setListings] = useState<JobListing[]>([]);
  const [platformUrls, setPlatformUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [filterSource, setFilterSource] = useState("All");
  const [filterType, setFilterType] = useState("All");

  // Auto-fill role / location / skills from the latest resume + profile once loaded.
  useEffect(() => {
    if (!dataReady) return;
    const rs = resumes.data ?? [];
    const p = profile.data;

    let role = "";
    if (rs.length > 0) {
      const latest = [...rs].sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0];
      role = latest.content?.contact?.title || "";
    }
    if (!role && p) role = p.preferences?.desired_role || p.personal?.headline || "";
    setTargetRole(role);

    let loc = "";
    if (p) loc = (p.preferences?.preferred_locations || [])[0] || p.personal?.location || "";
    setLocation(loc);

    const resumeSkills = rs.length > 0 ? rs[0].content?.skills || [] : [];
    const profileSkills = p?.skills || [];
    setSkills([...new Set([...resumeSkills, ...profileSkills])].slice(0, 20));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataReady]);

  const search = async () => {
    const role = targetRole.trim();
    if (!role) return;
    setLoading(true);
    setHasSearched(true);
    setListings([]);
    setFilterSource("All");
    setFilterType("All");
    try {
      const content = buildContentFromProfile(profile.data);
      const result: JobListingsResponse = await api.jobListings(content, role, location || null, skills);
      setListings(result.listings || []);
      setPlatformUrls({
        LinkedIn: result.linkedin_job_url,
        Naukri: result.naukri_job_url,
        Indeed: result.indeed_job_url,
        Monster: result.monster_url,
        Shine: result.shine_url,
        "Remote Jobs": result.remote_jobs_url,
        "Remote.com": result.remote_com_url,
        Crossover: result.crossover_url,
        "Remote.co": result.remote_co_url,
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const sources = useMemo(() => ["All", ...new Set(listings.map((j) => j.source))], [listings]);
  const jobTypes = useMemo(() => ["All", ...new Set(listings.map((j) => j.job_type))], [listings]);
  const filtered = listings.filter(
    (j) =>
      (filterSource === "All" || j.source === filterSource) &&
      (filterType === "All" || j.job_type === filterType),
  );
  const platformLinks = Object.entries(platformUrls).filter(([, url]) => !!url);

  return (
    <View style={{ flex: 1, backgroundColor: color.bg }}>
      <BackHeader title="Find Jobs" />
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={text.caption}>
          AI-matched listings from LinkedIn, Naukri, Indeed, Monster, Shine &amp; global remote
          boards.
        </Text>

        <Card style={{ gap: space.md }}>
          <TextField
            label={`Job title / role${resumes.data?.length ? " · pulled from your latest resume" : ""}`}
            value={targetRole}
            onChangeText={setTargetRole}
            placeholder="e.g. Senior Software Engineer"
            onSubmitEditing={() => void search()}
          />
          <TextField
            label="Preferred location"
            value={location}
            onChangeText={setLocation}
            placeholder="e.g. Bengaluru or Remote"
            onSubmitEditing={() => void search()}
          />
          <Text style={text.label}>Skills</Text>
          <ChipListEditor items={skills} onChange={setSkills} placeholder="Add a skill…" />
          <Button
            testID="jobs-search"
            label={loading ? "Searching…" : "🔍 Find Jobs"}
            variant="cta"
            loading={loading}
            disabled={loading || !targetRole.trim()}
            onPress={() => void search()}
          />
          {!dataReady ? <Text style={text.caption}>Loading your profile…</Text> : null}
        </Card>

        {loading ? (
          <View style={{ gap: space.md }}>
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
            <SkeletonCard lines={3} />
          </View>
        ) : null}

        {!loading && hasSearched ? (
          <>
            {platformLinks.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.linksRow}
                contentContainerStyle={styles.rowContent}
              >
                <Text style={[text.caption, { alignSelf: "center" }]}>Browse all on:</Text>
                {platformLinks.map(([label, url]) => (
                  <Chip
                    key={label}
                    label={label}
                    tint={color.surfaceSunken}
                    onPress={() => safeOpenUrl(url)}
                  />
                ))}
              </ScrollView>
            ) : null}

            {listings.length > 0 ? (
              <View style={{ gap: space.sm }}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.linksRow}
                  contentContainerStyle={styles.rowContent}
                >
                  {sources.map((s) => (
                    <Chip
                      key={s}
                      label={s}
                      selected={filterSource === s}
                      onPress={() => setFilterSource(s)}
                    />
                  ))}
                </ScrollView>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={styles.linksRow}
                  contentContainerStyle={styles.rowContent}
                >
                  {jobTypes.map((t) => (
                    <Chip key={t} label={t} selected={filterType === t} onPress={() => setFilterType(t)} />
                  ))}
                </ScrollView>
                <Text style={text.caption}>
                  {filtered.length} of {listings.length} jobs
                </Text>
              </View>
            ) : null}

            {filtered.length === 0 ? (
              <EmptyState
                emoji="🔍"
                title="No jobs found"
                message={
                  listings.length === 0
                    ? "Try a different role or location."
                    : "No jobs match the selected filters."
                }
              />
            ) : (
              <View style={{ gap: space.md }}>
                {filtered.map((job, i) => (
                  <JobCard key={i} job={job} />
                ))}
              </View>
            )}
          </>
        ) : null}

        {!hasSearched && !loading ? (
          <EmptyState
            emoji="💼"
            title="Find your next opportunity"
            message="Your role and skills are pre-filled from your resume and profile. Tap Find Jobs to get AI-matched postings."
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

function JobCard({ job }: { job: JobListing }) {
  const [expanded, setExpanded] = useState(false);
  const src = SOURCE_COLORS[job.source] || color.inkSoft;
  const isSearchCard = job.job_title.endsWith("— Live Search");
  const daysAgo =
    job.posted_days_ago === 1
      ? "Today"
      : job.posted_days_ago <= 7
        ? `${job.posted_days_ago}d ago`
        : `${Math.floor(job.posted_days_ago / 7)}w ago`;

  return (
    <Card style={isSearchCard ? { borderStyle: "dashed" } : undefined}>
      <View style={styles.jobHeader}>
        <View style={[styles.logo, { backgroundColor: src }]}>
          <Text style={styles.logoText}>{job.company.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={text.heading} numberOfLines={2}>
            {job.job_title}
          </Text>
          <Text style={text.caption} numberOfLines={1}>
            {job.company} · {job.location}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <Chip label={job.source} tint={src} textColor={color.white} />
          <Text style={text.caption}>{daysAgo}</Text>
        </View>
      </View>

      <View style={styles.badgeRow}>
        <Chip label={job.job_type} tint={color.surfaceSunken} />
        {job.experience_required ? <Chip label={job.experience_required} tint={color.surfaceSunken} /> : null}
        {job.salary_range ? <Chip label={job.salary_range} tint={color.ctaSoft} textColor={color.ctaDark} /> : null}
      </View>

      {job.skills_required?.length ? (
        <View style={styles.badgeRow}>
          {job.skills_required.slice(0, 6).map((s, i) => (
            <Chip key={i} label={s} tint={color.surfaceSunken} />
          ))}
          {job.skills_required.length > 6 ? (
            <Text style={text.caption}>+{job.skills_required.length - 6}</Text>
          ) : null}
        </View>
      ) : null}

      <Text style={text.body} numberOfLines={expanded ? undefined : 2}>
        {job.description}
      </Text>
      {(job.description?.length || 0) > 100 ? (
        <Text
          style={[text.caption, { color: color.primary, marginTop: 4 }]}
          onPress={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less ▲" : "Read more ▼"}
        </Text>
      ) : null}

      <Button
        label={isSearchCard ? `🔍 Search on ${job.source} →` : `Apply on ${job.source} →`}
        variant="primary"
        size="sm"
        style={{ marginTop: space.md, backgroundColor: src, alignSelf: "flex-start" }}
        onPress={() => safeOpenUrl(job.apply_url)}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { padding: space.lg, gap: space.md, paddingBottom: 60 },
  jobHeader: { flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.sm },
  logo: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { fontFamily: fontFamily.displayBold, fontSize: 18, color: color.white },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: space.sm },
  linksRow: { flexGrow: 0, marginBottom: space.xs },
  rowContent: { flexDirection: "row", alignItems: "center", gap: space.sm, paddingRight: space.md },
});
