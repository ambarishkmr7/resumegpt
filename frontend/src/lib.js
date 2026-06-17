export const DEFAULT_SECTION_ORDER = [
  "summary", "contact_info", "skill_ratings", "core_competencies", "certifications",
  "experience", "education", "skills", "accomplishments", "languages",
  "projects", "activities", "references",
];

export const SECTION_LABELS = {
  summary: "Professional Summary",
  contact_info: "Contact",
  skill_ratings: "Skills ★",
  core_competencies: "Core Competency",
  certifications: "Certification",
  experience: "Work History",
  education: "Education",
  skills: "Skills",
  accomplishments: "Accomplishments",
  languages: "Languages",
  projects: "Projects",
  activities: "Activities",
  references: "References",
};

export function emptyResume() {
  return {
    contact: { name: "", title: "", email: "", phone: "", location: "", linkedin: "", website: "" },
    profile_photo: "",
    summary: "",
    experience: [],
    education: [],
    skills: [],
    skill_ratings: [],
    core_competencies: [],
    projects: [],
    certifications: [],
    languages: [],
    accomplishments: [],
    activities: [],
    references: [],
    custom_sections: [],
    section_order: [...DEFAULT_SECTION_ORDER],
  };
}

export function emptyExperience() {
  return { title: "", company: "", location: "", start: "", end: "", bullets: [""] };
}
export function emptyEducation() {
  return { degree: "", school: "", location: "", start: "", end: "", details: "" };
}
export function emptyProject() {
  return { name: "", description: "", bullets: [""] };
}
export function emptyReference() {
  return { name: "", title: "", company: "", contact: "" };
}
export function emptySkillRating() {
  return { name: "", rating: 3 };
}
export function emptyCustomSection() {
  return { title: "Custom Section", items: [""] };
}

export function scoreColor(score) {
  if (score >= 85) return "var(--good)";
  if (score >= 60) return "var(--warn)";
  return "var(--crit)";
}
