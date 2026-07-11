import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../src/api/client";
import { errorMessage } from "../../src/api/errors";
import type {
  Education,
  Experience,
  ProfileEducationItem,
  ProfileExperienceItem,
  ProfilePreferences,
} from "../../src/api/types";
import { isGuest, useAuth } from "../../src/auth/store";
import {
  AddButton,
  ChipListEditor,
  RemovableItem,
  SectionCard,
} from "../../src/components/resume/editors";
import {
  Button,
  Card,
  Chip,
  Screen,
  ScoreRing,
  SkeletonCard,
  TextField,
  toast,
} from "../../src/components/ui";
import { useProfile, useResumes, useSubscriptionStatus } from "../../src/hooks/queries";
import { color, fontFamily, space, text } from "../../src/theme";

const JOB_TYPES = ["full-time", "part-time", "contract", "freelance"];
const REMOTE_PREFS = ["remote", "hybrid", "onsite", "flexible"];

export default function ProfileTab() {
  const user = useAuth((s) => s.user);
  const clearSession = useAuth((s) => s.clearSession);
  const qc = useQueryClient();
  const profile = useProfile();
  const resumes = useResumes();
  const sub = useSubscriptionStatus();

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedinUrl, setLinkedinUrl] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [education, setEducation] = useState<ProfileEducationItem[]>([]);
  const [experience, setExperience] = useState<ProfileExperienceItem[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [preferences, setPreferences] = useState<ProfilePreferences>({});
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [completion, setCompletion] = useState(0);

  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [autoFilledMsg, setAutoFilledMsg] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);
  const autoFillTried = useRef<string | null>(null);

  useEffect(() => {
    if (profile.data && loadedFor.current !== user?.id) {
      const p = profile.data;
      setFullName(p.personal?.full_name || user?.full_name || "");
      setPhone(p.personal?.phone || "");
      setLocation(p.personal?.location || "");
      setLinkedinUrl(p.personal?.linkedin_url || "");
      setHeadline(p.personal?.headline || "");
      setSummary(p.personal?.summary || "");
      setEducation(p.education || []);
      setExperience(p.experience || []);
      setSkills(p.skills || []);
      setPreferences(p.preferences || {});
      setPhotoKey(p.profile_photo_key || null);
      setCompletion(p.profile_completion || 0);
      loadedFor.current = user?.id ?? null;
    }
  }, [profile.data, user]);

  // Auto-fill empty profile fields from the latest resume once per user,
  // mirroring frontend/src/pages/ProfilePage.jsx's load-time fill().
  useEffect(() => {
    if (
      profile.data &&
      resumes.data &&
      resumes.data.length > 0 &&
      autoFillTried.current !== user?.id
    ) {
      autoFillTried.current = user?.id ?? null;
      const filled = fillFromLatestResume(true);
      if (filled > 0) {
        setAutoFilledMsg(`✨ Auto-filled ${filled} field(s) from your resume — review and save.`);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data, resumes.data, user]);

  function fillFromLatestResume(onlyEmpty: boolean): number {
    if (!resumes.data || resumes.data.length === 0) return 0;
    const latest = [...resumes.data].sort((a, b) =>
      (b.updated_at || "").localeCompare(a.updated_at || ""),
    )[0];
    const c = latest.content || {};
    let filled = 0;
    const shouldFill = (v: unknown) => !onlyEmpty || !v || (Array.isArray(v) && v.length === 0);

    if (shouldFill(fullName) && c.contact?.name) {
      setFullName(c.contact.name);
      filled++;
    }
    if (shouldFill(phone) && c.contact?.phone) {
      setPhone(c.contact.phone);
      filled++;
    }
    if (shouldFill(location) && c.contact?.location) {
      setLocation(c.contact.location);
      filled++;
    }
    if (shouldFill(linkedinUrl) && c.contact?.linkedin) {
      setLinkedinUrl(c.contact.linkedin);
      filled++;
    }
    if (shouldFill(headline) && c.contact?.title) {
      setHeadline(c.contact.title);
      filled++;
    }
    if (shouldFill(summary) && c.summary) {
      setSummary(c.summary);
      filled++;
    }
    if (shouldFill(education) && c.education?.length) {
      setEducation(c.education.map(mapResumeEducation));
      filled++;
    }
    if (shouldFill(experience) && c.experience?.length) {
      setExperience(c.experience.map(mapResumeExperience));
      filled++;
    }
    if (shouldFill(skills) && c.skills?.length) {
      setSkills(c.skills);
      filled++;
    }
    return filled;
  }

  const manualFill = () => {
    const filled = fillFromLatestResume(true);
    setAutoFilledMsg(null);
    toast.show(filled > 0 ? `Filled ${filled} field(s) from your latest resume.` : "Nothing new to fill — your profile already has these fields.");
  };

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.updateProfile({
        personal: {
          full_name: fullName,
          email: user?.email || "",
          phone,
          location,
          linkedin_url: linkedinUrl,
          headline,
          summary,
        },
        education,
        experience,
        skills,
        preferences,
      });
      setCompletion(updated.profile_completion || 0);
      setAutoFilledMsg(null);
      toast.success("Profile saved");
      void qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const pickPhoto = async () => {
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      toast.error("Photo library permission is needed to set a profile photo.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const res = await api.uploadProfilePhoto({
        uri: asset.uri,
        name: asset.fileName || "photo.jpg",
        mimeType: asset.mimeType || "image/jpeg",
      });
      setPhotoKey(res.profile_photo_key);
      void qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Photo updated");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploadingPhoto(false);
    }
  };

  const logout = () => {
    const doLogout = async () => {
      try {
        await api.logout();
      } catch {
        /* stateless logout — best effort */
      }
      qc.clear();
      await clearSession();
    };
    if (isGuest(user)) {
      Alert.alert(
        "Log out of guest account?",
        "Your resumes are tied to this guest session and will be lost. Create a free account first to keep them.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Save my work",
            onPress: () => router.push("/(auth)/register" as never),
          },
          { text: "Log out anyway", style: "destructive", onPress: () => void doLogout() },
        ],
      );
    } else {
      Alert.alert("Log out?", "You can sign back in anytime.", [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: () => void doLogout() },
      ]);
    }
  };

  const photoUrl = photoKey ? api.profilePhotoUrl(photoKey) : null;

  return (
    <Screen
      testID="profile-screen"
      title="Profile"
      subtitle={user?.email}
      headerRight={
        sub.data?.is_subscribed ? (
          <Chip label="⭐ Elite" tint={color.ctaSoft} textColor={color.ctaDark} />
        ) : undefined
      }
    >
      <View style={styles.avatarRow}>
        <SpringAvatar
          uri={photoUrl}
          initial={(fullName || user?.email || "?").slice(0, 1).toUpperCase()}
          loading={uploadingPhoto}
          onPress={() => void pickPhoto()}
        />
        <View style={{ flex: 1 }}>
          <Text style={text.heading}>{fullName || "Guest user"}</Text>
          <Text style={text.caption}>{user?.email}</Text>
          <Text style={[text.caption, { color: color.primary, marginTop: 2 }]}>
            Tap photo to change
          </Text>
        </View>
      </View>

      {isGuest(user) ? (
        <Card tint={color.warnSoft} style={{ marginBottom: space.lg }}>
          <Text style={text.label}>💾 Guest account</Text>
          <Text style={[text.caption, { marginBottom: space.md }]}>
            Add an email & password to keep your work safe.
          </Text>
          <Button
            testID="profile-claim"
            label="Save my account"
            variant="cta"
            size="sm"
            onPress={() => router.push("/(auth)/register" as never)}
          />
        </Card>
      ) : null}

      {profile.isLoading ? (
        <SkeletonCard lines={4} />
      ) : (
        <View style={{ gap: space.md }}>
          <Card style={styles.completionCard}>
            <ScoreRing score={completion} size={72} strokeWidth={7} label="complete" />
            <View style={{ flex: 1 }}>
              <Text style={text.heading}>Profile strength</Text>
              <Text style={text.caption}>
                Fill in every section to look your best to recruiters.
              </Text>
              <Button
                label="📄 Fill from resume"
                variant="ghost"
                size="sm"
                style={{ marginTop: space.sm }}
                onPress={manualFill}
                disabled={!resumes.data || resumes.data.length === 0}
              />
            </View>
          </Card>

          {autoFilledMsg ? (
            <Card tint={color.primaryFaint}>
              <Text style={[text.caption, { color: color.primaryDark }]}>{autoFilledMsg}</Text>
            </Card>
          ) : null}

          <Card style={{ gap: space.md }}>
            <Text style={text.title}>About you</Text>
            <TextField
              label="Full name"
              value={fullName}
              onChangeText={setFullName}
              placeholder="Jordan Rao"
            />
            <TextField label="Email" value={user?.email || ""} editable={false} />
            <TextField
              label="Headline"
              value={headline}
              onChangeText={setHeadline}
              placeholder="Senior Software Engineer"
            />
            <TextField
              label="Phone"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholder="+91 …"
            />
            <TextField
              label="Location"
              value={location}
              onChangeText={setLocation}
              placeholder="Bengaluru, India"
            />
            <TextField
              label="LinkedIn"
              value={linkedinUrl}
              onChangeText={setLinkedinUrl}
              autoCapitalize="none"
              placeholder="linkedin.com/in/…"
            />
            <TextField
              label="Professional summary"
              value={summary}
              onChangeText={setSummary}
              multiline
              placeholder="A short summary recruiters will love…"
            />
          </Card>

          <SectionCard emoji="🎓" title="Education" count={education.length}>
            {education.map((e, i) => (
              <RemovableItem
                key={i}
                title={e.degree || e.school || `Education ${i + 1}`}
                onRemove={() => setEducation(education.filter((_, j) => j !== i))}
              >
                <TextField
                  label="Degree"
                  value={e.degree || ""}
                  onChangeText={(v) => updateAt(education, setEducation, i, { degree: v })}
                />
                <TextField
                  label="School"
                  value={e.school || ""}
                  onChangeText={(v) => updateAt(education, setEducation, i, { school: v })}
                />
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Start year"
                      value={e.start_year || ""}
                      keyboardType="number-pad"
                      onChangeText={(v) => updateAt(education, setEducation, i, { start_year: v })}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="End year"
                      value={e.end_year || ""}
                      keyboardType="number-pad"
                      onChangeText={(v) => updateAt(education, setEducation, i, { end_year: v })}
                    />
                  </View>
                </View>
                <TextField
                  label="Grade / GPA"
                  value={e.grade || ""}
                  onChangeText={(v) => updateAt(education, setEducation, i, { grade: v })}
                />
              </RemovableItem>
            ))}
            <AddButton
              label="+ Add education"
              onPress={() => setEducation([...education, {}])}
            />
          </SectionCard>

          <SectionCard emoji="💼" title="Work experience" count={experience.length}>
            {experience.map((e, i) => (
              <RemovableItem
                key={i}
                title={e.title || e.company || `Role ${i + 1}`}
                onRemove={() => setExperience(experience.filter((_, j) => j !== i))}
              >
                <TextField
                  label="Job title"
                  value={e.title || ""}
                  onChangeText={(v) => updateAt(experience, setExperience, i, { title: v })}
                />
                <TextField
                  label="Company"
                  value={e.company || ""}
                  onChangeText={(v) => updateAt(experience, setExperience, i, { company: v })}
                />
                <View style={styles.twoCol}>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="Start"
                      value={e.start_date || ""}
                      placeholder="Jan 2022"
                      onChangeText={(v) =>
                        updateAt(experience, setExperience, i, { start_date: v })
                      }
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <TextField
                      label="End"
                      value={e.current ? "Present" : e.end_date || ""}
                      editable={!e.current}
                      placeholder="Present"
                      onChangeText={(v) => updateAt(experience, setExperience, i, { end_date: v })}
                    />
                  </View>
                </View>
                <Chip
                  label={e.current ? "✓ Currently working here" : "Currently working here"}
                  selected={e.current}
                  onPress={() =>
                    updateAt(experience, setExperience, i, { current: !e.current })
                  }
                />
                <TextField
                  label="Description"
                  value={e.description || ""}
                  multiline
                  onChangeText={(v) =>
                    updateAt(experience, setExperience, i, { description: v })
                  }
                />
              </RemovableItem>
            ))}
            <AddButton
              label="+ Add role"
              onPress={() => setExperience([...experience, {}])}
            />
          </SectionCard>

          <SectionCard emoji="⭐" title="Skills" count={skills.length} initiallyOpen>
            <ChipListEditor items={skills} onChange={setSkills} placeholder="Add a skill…" />
          </SectionCard>

          <SectionCard emoji="🎯" title="Career preferences">
            <TextField
              label="Desired role"
              value={preferences.desired_role || ""}
              onChangeText={(v) => setPreferences({ ...preferences, desired_role: v })}
              placeholder="Product Manager"
            />
            <Text style={text.label}>Preferred locations</Text>
            <ChipListEditor
              items={preferences.preferred_locations || []}
              onChange={(v) => setPreferences({ ...preferences, preferred_locations: v })}
              placeholder="Add a city…"
            />
            <View style={styles.twoCol}>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Min salary"
                  value={preferences.expected_salary_min || ""}
                  keyboardType="numeric"
                  onChangeText={(v) =>
                    setPreferences({ ...preferences, expected_salary_min: v })
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <TextField
                  label="Max salary"
                  value={preferences.expected_salary_max || ""}
                  keyboardType="numeric"
                  onChangeText={(v) =>
                    setPreferences({ ...preferences, expected_salary_max: v })
                  }
                />
              </View>
            </View>
            <Text style={text.label}>Job type</Text>
            <View style={styles.chipRow}>
              {JOB_TYPES.map((jt) => (
                <Chip
                  key={jt}
                  label={jt}
                  selected={preferences.job_type === jt}
                  onPress={() =>
                    setPreferences({
                      ...preferences,
                      job_type: preferences.job_type === jt ? "" : jt,
                    })
                  }
                />
              ))}
            </View>
            <Text style={text.label}>Remote preference</Text>
            <View style={styles.chipRow}>
              {REMOTE_PREFS.map((rp) => (
                <Chip
                  key={rp}
                  label={rp}
                  selected={preferences.remote_preference === rp}
                  onPress={() =>
                    setPreferences({
                      ...preferences,
                      remote_preference: preferences.remote_preference === rp ? "" : rp,
                    })
                  }
                />
              ))}
            </View>
          </SectionCard>

          <Button
            testID="profile-save"
            label="Save profile"
            loading={saving}
            onPress={() => void save()}
          />
        </View>
      )}

      <View style={{ gap: space.md, marginTop: space.xl }}>
        <Button
          label="⚙️ Settings"
          variant="ghost"
          onPress={() => router.push("/settings")}
        />
        <Button
          label="💳 Plans & billing"
          variant="ghost"
          onPress={() => router.push("/subscription")}
        />
        {user?.is_admin ? (
          <Button
            testID="profile-admin"
            label="🛠️ Admin dashboard"
            variant="secondary"
            onPress={() => router.push("/admin")}
          />
        ) : null}
        <Button
          testID="profile-logout"
          label="Log out"
          variant="danger"
          onPress={logout}
        />
      </View>
    </Screen>
  );
}

function updateAt<T>(
  arr: T[],
  setArr: (v: T[]) => void,
  index: number,
  patch: Partial<T>,
) {
  const next = [...arr];
  next[index] = { ...next[index], ...patch };
  setArr(next);
}

function mapResumeEducation(e: Education): ProfileEducationItem {
  return {
    degree: e.degree || "",
    school: e.school || "",
    location: e.location || "",
    start_year: (e.start || "").slice(0, 4),
    end_year: (e.end || "").slice(0, 4),
    grade: "",
  };
}

function mapResumeExperience(e: Experience): ProfileExperienceItem {
  return {
    title: e.title || "",
    company: e.company || "",
    location: e.location || "",
    start_date: e.start || "",
    end_date: e.end || "",
    current: /present/i.test(e.end || ""),
    description: (e.bullets || []).join("\n"),
  };
}

function SpringAvatar({
  uri,
  initial,
  loading,
  onPress,
}: {
  uri: string | null;
  initial: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID="profile-photo-pick"
      style={styles.avatar}
      onPress={onPress}
      disabled={loading}
    >
      {uri ? (
        <Image source={{ uri }} style={styles.avatarImg} />
      ) : (
        <Text style={styles.avatarText}>{initial}</Text>
      )}
      {loading ? <View style={styles.avatarOverlay} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatarRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.lg,
    marginBottom: space.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: color.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImg: { width: 64, height: 64 },
  avatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.25)",
  },
  avatarText: {
    fontFamily: fontFamily.displayBold,
    fontSize: 28,
    color: color.primaryDark,
  },
  completionCard: { flexDirection: "row", alignItems: "center", gap: space.lg },
  twoCol: { flexDirection: "row", gap: space.md },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
