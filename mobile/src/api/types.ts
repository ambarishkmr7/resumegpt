// Shapes mirrored from backend/app/schemas.py and the web client's usage.

export interface User {
  id: string;
  email: string;
  full_name?: string | null;
  is_admin?: boolean;
  is_guest?: boolean;
  created_at?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type?: string;
  user: User;
}

// ---- Resume content (shape from frontend/src/lib.js emptyResume) ----
export interface Contact {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  website?: string;
}

export interface Experience {
  title?: string;
  company?: string;
  location?: string;
  start?: string;
  end?: string;
  bullets?: string[];
}

export interface Education {
  degree?: string;
  school?: string;
  location?: string;
  start?: string;
  end?: string;
  details?: string;
}

export interface Project {
  name?: string;
  description?: string;
  bullets?: string[];
}

export interface Reference {
  name?: string;
  title?: string;
  company?: string;
  contact?: string;
}

export interface SkillRating {
  name: string;
  rating: number; // 1-5
}

export interface CustomSection {
  title: string;
  items: string[];
}

export interface ResumeContent {
  contact?: Contact;
  profile_photo?: string;
  summary?: string;
  experience?: Experience[];
  education?: Education[];
  skills?: string[];
  skill_ratings?: SkillRating[];
  core_competencies?: string[];
  projects?: Project[];
  certifications?: string[];
  languages?: string[];
  accomplishments?: string[];
  activities?: string[];
  references?: Reference[];
  custom_sections?: CustomSection[];
  section_order?: string[];
}

export interface Resume {
  id: string;
  title: string;
  template_id?: string | null;
  content: ResumeContent;
  ats_score?: number | null;
  created_at?: string;
  updated_at?: string;
  has_original?: boolean;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  accent?: string;
  layout?: string;
  description?: string;
  photo?: boolean;
}

// ---- AI ----
export interface AtsIssue {
  category: string;
  severity: "critical" | "warning" | "info";
  message: string;
  suggestion: string;
}

export interface AtsResult {
  score: number;
  breakdown: Record<string, number>;
  issues: AtsIssue[];
  matched_keywords: string[];
  missing_keywords: string[];
}

export interface SuggestResponse {
  improved_content: ResumeContent;
  notes: string[];
}

export interface WeaknessItem {
  text: string;
  urgency: string; // "High Priority" | "Medium Priority" | "Low Priority"
}

export interface RecommendationItem {
  text: string;
  impact: string;
  why_it_matters: string;
}

export interface CareerAnalysis {
  strengths: string[];
  weaknesses: WeaknessItem[];
  recommendations: RecommendationItem[];
  overall_assessment: string;
}

export interface RoadmapStep {
  text: string;
  timeframe: string;
  category: string;
  explanation: string;
}

export interface CareerRoadmap {
  current_level: string;
  next_roles: string[];
  roadmap_steps: RoadmapStep[];
  recommended_certifications: {
    name: string;
    institution: string;
    udemy_url: string;
    description: string;
  }[];
  skill_gaps: string[];
  timeline: string;
  youtube_channels: { name: string; url: string; topic: string }[];
  learning_resources: { platform: string; url: string; description: string }[];
}

// ---- Jobs ----
export interface JobListing {
  job_title: string;
  company: string;
  location: string;
  job_type: string; // Full-time / Remote / Hybrid / Contract
  experience_required: string;
  skills_required: string[];
  description: string;
  salary_range: string;
  source: string; // LinkedIn / Naukri / Indeed / Monster / Shine / ...
  posted_days_ago: number;
  apply_url: string;
}

export interface JobListingsResponse {
  listings: JobListing[];
  linkedin_job_url: string;
  naukri_job_url: string;
  indeed_job_url: string;
  monster_url: string;
  shine_url: string;
  remote_jobs_url: string;
  remote_com_url: string;
  crossover_url: string;
  remote_co_url: string;
}

// ---- Career agent chat ----
export interface AgentMessage {
  role: "user" | "assistant" | "tool" | string;
  content: string;
  id?: string | null;
}

export interface AgentChatResponse {
  response: string;
  thread_id: string;
  messages: AgentMessage[];
}

export interface AgentConversationSummary {
  thread_id: string;
  title: string;
  last_message: string;
  updated_at: string;
}

export interface AgentConversationDetail {
  thread_id: string;
  messages: AgentMessage[];
}

// ---- Subscription / billing ----
export interface Plan {
  id: string;
  name: string;
  price_inr: number;
  interview_minutes?: number;
  features?: string[];
  badge?: string | null;
  is_default?: boolean;
  recurring?: boolean;
}

export interface RefillPack {
  id: string;
  name: string;
  price_inr: number;
  total_minutes?: number;
  bonus_minutes?: number;
  badge?: string | null;
}

export interface SubscriptionStatus {
  is_subscribed: boolean;
  plan_id?: string | null;
  plan_name?: string | null;
  payment_id?: string | null;
  expires_at?: string | null;
  [k: string]: unknown;
}

export interface UsageSummary {
  available_seconds: number;
  available_minutes: number;
  allowance_seconds: number;
  refill_seconds: number;
  used_seconds?: number;
  plan_name?: string | null;
  cycle_end?: string | null;
}

export interface CouponInfo {
  code: string;
  discount_inr: number;
  final_inr: number;
}

export interface CreateOrderResponse {
  order_id?: string;
  amount?: number; // paise
  currency?: string;
  razorpay_key_id?: string;
  base_inr?: number;
  discount_inr?: number;
  final_inr?: number;
  free?: boolean;
}

export interface CreateSubscriptionResponse {
  subscription_id?: string;
  razorpay_key_id?: string;
  plan_id?: string;
  amount?: number;
  demo?: boolean;
}

// Mirrors backend GET /api/subscription/payments row shape exactly
// (router.py) — NOT amount_inr/kind/description, which don't exist there.
export interface PaymentRecord {
  id: string;
  order_id?: string | null;
  payment_id?: string | null;
  type?: string; // "subscription" | "refill"
  plan?: string | null; // plan/pack name or slug
  amount?: number; // rupees
  discount_inr?: number;
  coupon_code?: string | null;
  status?: string; // "created" | "paid" | "failed" | ...
  created_at?: string;
}

// ---- Interview ----
export interface InterviewCompetency {
  name: string;
  score?: number;
  note?: string;
}

export interface InterviewQuestionNote {
  question: string;
  assessment: string;
}

export interface InterviewReport {
  overall_score?: number;
  verdict?: string;
  summary?: string;
  competencies?: InterviewCompetency[];
  strengths?: string[];
  weaknesses?: string[];
  recommendations?: string[];
  question_notes?: InterviewQuestionNote[];
}

export interface InterviewSessionSummary {
  id: string;
  resume_id?: string;
  resume_title?: string;
  overall_score?: number | null;
  duration_seconds?: number;
  has_audio?: boolean;
  created_at: string;
}

export interface InterviewSessionDetail extends InterviewSessionSummary {
  report?: InterviewReport | null;
  transcript?: unknown;
}

// Live WS messages (server -> client)
export type LiveServerMessage =
  | { type: "audio"; data: string }
  | { type: "status"; state: "connected" | "reconnected" | "reconnecting" | "time_up" }
  | { type: "interrupted" }
  | { type: "report"; data: { session_id?: string; report?: InterviewReport; duration_seconds?: number } }
  | { type: "error"; message?: string; code?: string };

// ---- Profile (mirrors backend UserProfileOut / UserProfileUpdate) ----
export interface PersonalInfo {
  full_name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin_url?: string;
  headline?: string;
  summary?: string;
}

export interface ProfileEducationItem {
  degree?: string;
  school?: string;
  location?: string;
  start_year?: string;
  end_year?: string;
  grade?: string;
}

export interface ProfileExperienceItem {
  title?: string;
  company?: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  current?: boolean;
  description?: string;
}

export interface ProfilePreferences {
  desired_role?: string;
  preferred_locations?: string[];
  expected_salary_min?: string;
  expected_salary_max?: string;
  job_type?: string;
  remote_preference?: string;
}

export interface Profile {
  user_id?: string;
  personal: PersonalInfo;
  education: ProfileEducationItem[];
  experience: ProfileExperienceItem[];
  skills: string[];
  preferences: ProfilePreferences;
  profile_photo_key?: string | null;
  profile_completion?: number;
  updated_at?: string | null;
}

// Body for PUT /api/profile/me — every section is optional (partial update).
export interface ProfileUpdate {
  personal?: PersonalInfo;
  education?: ProfileEducationItem[];
  experience?: ProfileExperienceItem[];
  skills?: string[];
  preferences?: ProfilePreferences;
}
