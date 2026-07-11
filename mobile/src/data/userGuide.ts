// In-app user guide, written for the mobile app's actual screens (tabs,
// gestures, native pickers) — NOT a copy of the web guide, which describes a
// desktop browser UI that doesn't exist here.

export interface GuideSection {
  id: string;
  icon: string;
  title: string;
  steps: string[];
}

export const USER_GUIDE = {
  updated: "July 2026",
  intro:
    "A quick tour of resumesGPT on mobile — from your first resume to interview practice.",
  sections: [
    {
      id: "getting-started",
      icon: "🚀",
      title: "1. Create your account",
      steps: [
        "Sign up with email, Google, or tap “Continue as guest” to try it instantly.",
        "Guest work is saved to this device — create a free account any time from the Profile tab to keep it permanently.",
      ],
    },
    {
      id: "first-resume",
      icon: "📄",
      title: "2. Start a resume",
      steps: [
        "On the Home tab, tap “+ New resume” to build one from scratch, or “Import” to upload an existing PDF/DOCX.",
        "Importing parses your file with AI and scores it instantly — no manual retyping.",
        "You can keep several resumes and switch between them from the Home tab.",
      ],
    },
    {
      id: "edit-resume",
      icon: "✏️",
      title: "3. Edit & organize sections",
      steps: [
        "Open a resume to expand sections — contact, summary, experience, education, skills, projects, and more.",
        "Tap “✨ Improve with AI” to have your bullet points rewritten with stronger, quantified language.",
        "Changes autosave as you type — no save button needed.",
      ],
    },
    {
      id: "ats-score",
      icon: "🎯",
      title: "4. Check your ATS score",
      steps: [
        "Tap “🎯 ATS score” on any resume to see how it scores out of 100 against a job description you paste in.",
        "Work through the listed issues — missing keywords, weak bullets, formatting — then re-check to watch the score improve.",
      ],
    },
    {
      id: "profile",
      icon: "👤",
      title: "5. Build your profile",
      steps: [
        "On the Profile tab, tap “📄 Fill from resume” to auto-populate your profile from your latest resume.",
        "Add education, experience, skills, and job preferences — the ring shows how complete your profile is.",
        "Tap your photo to add a profile picture.",
      ],
    },
    {
      id: "tools",
      icon: "🧰",
      title: "6. Use the AI career tools",
      steps: [
        "The Tools tab has Career Analysis, Career Roadmap, and Cover Letter generation for any resume.",
        "“Find Jobs” searches live listings across LinkedIn, Naukri, Indeed and more, pre-filled from your profile.",
        "“Career Assistant” is a persistent AI chat for career questions — your threads are saved so you can pick up later.",
      ],
    },
    {
      id: "interview",
      icon: "🎙️",
      title: "7. Practice a mock interview",
      steps: [
        "On the Interview tab, pick a resume to start a live, voice-based mock interview.",
        "After the session, review your report: overall score, strengths, weaknesses, and question-by-question notes.",
      ],
    },
    {
      id: "elite",
      icon: "⭐",
      title: "8. Upgrade for more interview minutes",
      steps: [
        "Free accounts include limited interview minutes each month.",
        "From Profile → “💳 Plans & billing”, choose a monthly plan or a one-time refill pack, then pay securely via Razorpay.",
        "Your payment history and current plan are always visible under Settings.",
      ],
    },
  ] as GuideSection[],
  closing:
    "That's the full workflow. Screens ship improvements regularly, but this flow stays the same.",
};
