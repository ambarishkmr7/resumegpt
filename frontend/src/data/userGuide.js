// User Guide content. Each section maps to an illustrative screenshot in
// /public/guide/. The numbered amber callouts in each screenshot correspond to
// the numbered steps below it.
//
// NOTE: the screenshots are clean illustrative mockups of each screen. To use
// real screenshots instead, drop PNG/JPG files into frontend/public/guide/ and
// point `image` at them (e.g. "/guide/getting-started.png") — no code change
// beyond the path is required.

export const USER_GUIDE = {
  updated: "June 2026",
  intro:
    "Welcome to resumes-gpt. This guide walks through every feature step by step — from creating your account to building an ATS-friendly resume, checking your ATS score, and using the Elite AI tools. Each step is numbered to match the highlighted markers in the screenshot beside it.",
  sections: [
    {
      id: "getting-started",
      icon: "🚀",
      title: "1. Create an account or sign in",
      intro:
        "You can start for free. An account lets you save resumes, download them, and return to edit later.",
      image: "/guide/getting-started.svg",
      imageAlt: "resumes-gpt sign-up screen with email, password, and social login",
      steps: [
        "Click “Get started” in the top bar, then enter your email and a password.",
        "Press “Create account” to register instantly — no email confirmation needed to begin.",
        "Prefer not to sign up yet? Use “Continue as guest” or “Google” to jump straight in. (Guest work can be saved by creating an account later.)",
      ],
      tip: "Already registered? Use the “Login” link instead. Forgot your password? Use “Forgot password” to get a secure reset link by email.",
    },
    {
      id: "choose-template",
      icon: "📄",
      title: "2. Choose a resume template",
      intro:
        "Pick from 30+ role-specific templates. Each is single-column and ATS-tested, with a live preview.",
      image: "/guide/choose-template.svg",
      imageAlt: "Grid of resume templates by job role",
      steps: [
        "On the home page, open the “Free Resume Templates” panel to browse roles (Software Engineer, Data Scientist, HR, Doctor, and more).",
        "Click a template to open its full preview page, where you can read the sample content, objective, and cover letter.",
        "Press “Use template” (or “Pick resume”) to copy it into your account as a new, editable resume.",
      ],
      tip: "Not sure which to pick? Choose the template closest to your target job title — you can change the wording freely afterwards.",
    },
    {
      id: "edit-resume",
      icon: "✏️",
      title: "3. Edit your resume",
      intro:
        "The editor has your details on the left and a live preview on the right, so you see changes instantly.",
      image: "/guide/edit-resume.svg",
      imageAlt: "Resume editor with form fields and a live preview pane",
      steps: [
        "Fill in each field — name, summary, work experience, skills, and education. The preview updates as you type.",
        "Use “Improve my bullets ✦” to let AI rewrite your experience into stronger, metric-driven lines (see section 6).",
        "Watch the live preview on the right to confirm the layout stays clean and one-column.",
      ],
      tip: "Keep bullet points action-led and quantified (“cut load time by 40%”) — it reads better to both recruiters and ATS keyword search.",
    },
    {
      id: "my-resumes",
      icon: "🗂️",
      title: "4. Manage and download your resumes",
      intro:
        "Your saved resumes live in the “My Resumes” section on the home page. You can keep up to 4 resumes for editing at once.",
      image: "/guide/my-resumes.svg",
      imageAlt: "My Resumes section showing resume cards with edit and download buttons",
      steps: [
        "See how many slots you’ve used with the “X of 4 used” indicator. You can hold up to four resumes; delete one to free a slot.",
        "Click “Edit” on any card to reopen it in the editor.",
        "Download a finished resume as “PDF” or “DOCX” using the buttons on each card.",
      ],
      tip: "Tailor a separate resume per job type (e.g. one for frontend roles, one for full-stack) and keep your best four ready to send.",
    },
    {
      id: "ats-score",
      icon: "📊",
      title: "5. Check and improve your ATS score",
      intro:
        "The ATS checker scores your resume out of 100 and lists exactly what to fix. The score is consistent — the same resume always gets the same number.",
      image: "/guide/ats-score.svg",
      imageAlt: "ATS score ring at 82 with a list of suggested fixes",
      steps: [
        "Open the ATS checker and paste the target job description so it can match keywords.",
        "Read your score on the ring — green checks are passing; amber items are quick wins.",
        "Work down the “Suggested fixes” list (missing keywords, summary length, quantified bullets), then re-check to watch your score rise.",
      ],
      tip: "Aim for a strong score, but don’t keyword-stuff. Only add skills and terms that are genuinely true for you.",
    },
    {
      id: "ai-tools",
      icon: "✦",
      title: "6. Use the AI writing tools",
      intro:
        "AI helps you rewrite weak bullet points and draft a tailored cover letter in seconds — using your real experience, not invented claims.",
      image: "/guide/ai-tools.svg",
      imageAlt: "AI resume rewrite suggestion and cover letter generator",
      steps: [
        "In “AI Resume Rewrite”, pick a bullet and let the AI suggest a sharper, quantified version. Click “Apply suggestion” to accept or “Regenerate” for another option.",
        "Review every suggestion before applying — keep what’s accurate, edit anything that isn’t.",
        "Open the “Cover Letter Generator”, confirm the role details, and press “Generate cover letter” to get a tailored draft you can refine.",
      ],
      tip: "AI is a co-pilot. Recruiters can spot generic AI text — personalise the output so it sounds like you.",
    },
    {
      id: "upgrade-elite",
      icon: "👑",
      title: "7. Upgrade to Elite (optional)",
      intro:
        "Building, editing, scoring, and downloading are free. Elite is a one-time upgrade that unlocks the advanced AI toolkit.",
      image: "/guide/upgrade-elite.svg",
      imageAlt: "Elite upgrade dialog with price and feature list",
      steps: [
        "Click the Elite plan (or any Elite-only feature) to open the upgrade dialog with the current price and full feature list.",
        "Review what’s included — unlimited downloads, all templates, the job agent, learning materials, and mock interviews.",
        "Press “Pay … — Unlock Everything” to complete a secure one-time payment via Razorpay. Access unlocks immediately.",
      ],
      tip: "Elite is a one-time payment with lifetime access — there are no recurring charges.",
    },
    {
      id: "elite-tools",
      icon: "🧰",
      title: "8. Use the Elite AI tools",
      intro:
        "Once on Elite, your advanced job-search toolkit appears as a grid of cards. Open any tool to get started.",
      image: "/guide/elite-tools.svg",
      imageAlt: "Grid of Elite AI tools",
      steps: [
        "“Learning Materials” builds skill-based interview Q&A tailored to the skills on your resume, with a downloadable study sheet.",
        "“Mock Interview” lets you practice answers and get rated, while “Interview Gap Analysis” shows what to improve.",
        "“Job Application Agent” helps you apply on LinkedIn with tailored cover letters, and “Career Counseling” gives an AI roadmap for your goals.",
      ],
      tip: "Run the ATS checker and Learning Materials together before an interview — score the resume you’re sending, then study the matching questions.",
    },
  ],
  closing:
    "That’s the full workflow. If anything looks different in your account, it’s because we ship improvements regularly — the steps above still apply. For more help, visit the FAQ or Contact pages.",
};
