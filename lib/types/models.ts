/**
 * Firestore data model — shared types for client and server.
 *
 * See docs/FIRESTORE_MODEL.md for the collection layout and design rationale.
 *
 * Timestamps are typed structurally so this file does not couple to either
 * the client (`firebase/firestore`) or admin (`firebase-admin/firestore`) SDK.
 */
export type Ts = { toDate(): Date; seconds: number; nanoseconds: number };

// ----- Enums ---------------------------------------------------------
export type ProgramLevel = 'undergraduate' | 'master' | 'doctoral';
export type PloSchema = '4_domain' | '6_domain_tqf';
export type PloDomain =
  | 'ethics'
  | 'knowledge'
  | 'intellectual'
  | 'interpersonal'
  | 'numerical_comm_it'
  | 'psychomotor'
  | 'character'
  | 'skill';
export type CourseType = 'theory' | 'theory_practice' | 'practice' | 'field' | 's_u';
export type Semester = '1' | '2' | '3'; // 3 = summer
export type AppRole =
  | 'admin'
  | 'program_director'
  | 'assessor'
  | 'verification_committee'
  | 'corresponding_lecturer';
/**
 * Categories of source document a lecturer submits for analysis.
 * NOTE: these files are transient — they are streamed to Gemini and then
 * discarded. They are NOT stored. Only the generated PDF report persists
 * (in Firebase Storage). `UploadType` is kept only to label submitted files
 * and define what the lecturer is expected to provide.
 */
export type UploadType =
  | 'tqf3'
  | 'tqf4'
  | 'tqf5'
  | 'tqf6'
  | 'grade_report_pdf'
  | 'grade_raw_scores'
  | 'item_analysis'
  | 'rubric'
  | 'supporting';
export type OfferingStatus =
  | 'draft'
  | 'documents_pending'
  | 'ready_for_ai'
  | 'ai_in_progress'
  | 'ai_complete'
  | 'pending_assessment'
  | 'assessor_review'
  | 'pending_head_signoff'
  | 'assessed'
  | 'assessed_self_only'
  | 'closed_documents_only'
  | 'verification_review'
  | 'verified'
  | 'needs_follow_up'
  | 'pending_review_next_semester'
  | 'implemented'
  | 'not_implemented';
export type AiReportStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type RubricScore = 1 | 2 | 3 | 'na';
export type AssessmentBand = 'improve' | 'good' | 'excellent';
export type SignOffKind = 'committee' | 'self_only' | 'documents_only';
export type ImplementationDecision =
  | 'implemented'
  | 'not_implemented'
  | 'partially_implemented';
export type VerificationDecision = 'verified' | 'needs_follow_up';

// ----- users/{uid} ---------------------------------------------------
export interface UserDoc {
  email: string;
  nameTh: string;
  nameEn: string;
  titleTh?: string;
  titleEn?: string;
  isActive: boolean;
  /**
   * Roles are denormalized onto the user doc so Firestore security rules
   * can authorize via a single get() with no joins. Concrete teaching
   * assignments still live on each offering's `lecturerId`.
   */
  roles: {
    /**
     * Optional — added 2026-05. Super admins are the only users who may
     * manage other admins (grant/revoke admin or super-admin, edit or
     * deactivate an admin account). A super admin is a strict superset of
     * admin: whenever this is true, `isAdmin` is also kept true, so every
     * existing `isAdmin` check still passes. Missing = false.
     */
    isSuperAdmin?: boolean;
    isAdmin: boolean;
    /**
     * Optional — added 2026-05. Drives visibility of the lecturer
     * workspace ("รายวิชาที่รับผิดชอบ") in the cross-workspace switcher.
     * Auto-granted (one-way) when a user is assigned as an offering's
     * lecturer; can also be set manually. NOT the source of which
     * offerings appear — that's still `offerings.lecturerId`. Missing =
     * false.
     */
    isLecturer?: boolean;
    /**
     * Legacy curriculum-scope role arrays (`programs/{id}` ids). Kept
     * populated as an expanded compatibility mirror while role assignment
     * moves to academic-program scope.
     */
    directorOf: string[]; // curriculum ids
    assessorOf: string[]; // curriculum ids
    verifierOf: string[]; // curriculum ids
    /**
     * Optional — added 2026-06. Read-only assessor scope (curriculum ids)
     * granted to external assessment-committee members. Lets them see the
     * assessor queue and open course details, but grants NO write access
     * anywhere (only `assessorOf` passes the edit/submit/verify gates).
     */
    assessorViewerOf?: string[]; // curriculum ids
    lecturerOf?: string[]; // curriculum ids
    /** Academic-program-scope role arrays (`academicPrograms/{id}` ids). */
    directorOfAcademicPrograms?: string[];
    assessorOfAcademicPrograms?: string[];
    assessorViewerOfAcademicPrograms?: string[];
    verifierOfAcademicPrograms?: string[];
  };
  createdAt: Ts;
  updatedAt: Ts;
}

// ----- programs/{programId} -----------------------------------------
export interface ProgramPlo {
  ploNumber: number;
  domain: PloDomain;
  descriptionTh: string;
  descriptionEn?: string;
  bloomLevel?: number; // 1..6
}

/**
 * Academic Program (หลักสูตร) — the degree program. Belongs to a
 * department; owns one or more curriculum revisions. Stored in the
 * `academicPrograms` collection.
 *
 * NOTE on naming: the existing `programs` collection (ProgramDoc below)
 * actually represents a *curriculum revision* (ฉบับปรับปรุง) — it carries
 * the PLOs/courses/offerings. We keep that collection + its `programId`
 * foreign keys unchanged to avoid a system-wide rename; `AcademicProgramDoc`
 * is the new parent layer above it.
 */
export interface AcademicProgramDoc {
  code: string;
  nameTh: string;
  nameEn: string;
  level: ProgramLevel;
  /** The department this program belongs to. */
  departmentId?: string | null;
  isActive: boolean;
  /** Standing assessment-verification committee for this program (added 2026-06). */
  assessmentCommittee?: AssessmentCommittee | null;
  createdAt: Ts;
  updatedAt: Ts;
}

/**
 * One person on a program's assessment-verification committee. Directory picks
 * carry a `uid` (a real user) or `allowlistId` (pending sign-in) for traceability
 * and access-granting; free-typed external assessors carry only a name.
 */
export interface AssessmentCommitteeMember {
  name: string;
  uid?: string;
  allowlistId?: string;
}

/**
 * Standing assessment committee per academic program. Internal roles
 * (head, internal assessors, secretary) also grant `assessorOfAcademicPrograms`
 * access; external assessors are recorded names only.
 */
export interface AssessmentCommittee {
  headAssessor: AssessmentCommitteeMember | null; // ประธานผู้ทวนสอบ
  externalAssessors: AssessmentCommitteeMember[]; // ผู้ทวนสอบภายนอก (≤3)
  internalAssessors: AssessmentCommitteeMember[]; // ผู้ทวนสอบภายใน (program lecturers)
  secretary: AssessmentCommitteeMember | null; // ผู้ทวนสอบภายในและเลขานุการ
  updatedAt?: Ts;
  updatedBy?: string;
}

/**
 * Curriculum revision (ฉบับปรับปรุง). Despite the name, the `programs`
 * collection is the curriculum layer — it owns PLOs, courses, and
 * offerings, and is the unit assessed for TQF/AUN-QA. `programId`
 * foreign keys elsewhere point here.
 */
export interface ProgramDoc {
  code: string;
  nameTh: string;
  nameEn: string;
  school: string;
  level: ProgramLevel;
  ploDomainSchema: PloSchema;
  isActive: boolean;
  /**
   * Optional — added 2026-05. The managed department this curriculum
   * belongs to. Kept populated for backward-compatible reads even after
   * `parentProgramId` is introduced (department is also derivable from
   * the parent program).
   */
  departmentId?: string | null;
  /**
   * Optional — added 2026-05. The parent academic program (หลักสูตร)
   * this curriculum revision belongs to. `null` until an admin assigns
   * it. Surfaced in the UI as "ไม่ระบุ".
   */
  parentProgramId?: string | null;
  /** Embedded — only ~6 PLOs, always read together with the curriculum. */
  plos: ProgramPlo[];
  createdAt: Ts;
  updatedAt: Ts;
}

// ----- allowlist/{normalizedEmail} -----------------------------------
/**
 * Pre-provisioned user invitation. Doc ID is the lowercased email.
 * Created by admin (single or CSV); consumed on first Google sign-in,
 * at which point the auth route bootstraps a `users/{uid}` doc from
 * these fields. The allowlist entry is kept (with `consumedAt`/`consumedUid`
 * stamped) as a permanent audit trail.
 */
export interface AllowlistDoc {
  email: string;
  nameTh: string;
  nameEn: string;
  notes?: string;
  /**
   * Roles applied to the new users/{uid} doc on first sign-in. Lecturer
   * defaults true; director is opt-in and needs an academic program.
   * Existing rows without these fields are treated as lecturer=true,
   * director=false.
   */
  presetIsLecturer?: boolean;
  presetIsDirector?: boolean;
  /** Academic program id; older rows may contain a curriculum id. */
  presetDirectorProgramId?: string | null;
  /** Academic-program ids applied as director roles when this pending user first signs in. */
  presetDirectorAcademicProgramIds?: string[];
  /** Academic-program ids expanded to `roles.lecturerOf` when this pending user first signs in. */
  presetLecturerAcademicProgramIds?: string[];
  /** Academic-program ids applied to `roles.assessorOfAcademicPrograms` on first sign-in
   *  (set when a pending user is placed on a program's assessment committee). */
  presetAssessorAcademicProgramIds?: string[];
  /** Academic-program ids applied to `roles.assessorViewerOfAcademicPrograms` on first
   *  sign-in (set when a pending user is placed as an external assessor — read-only). */
  presetAssessorViewerAcademicProgramIds?: string[];
  /** Academic-program ids applied to `roles.verifierOfAcademicPrograms` on first sign-in
   *  (set when a pending user is placed on a program's verification committee). */
  presetVerifierAcademicProgramIds?: string[];
  addedBy: string; // admin uid
  addedAt: Ts;
  consumedAt?: Ts | null;
  consumedUid?: string | null;
}

// ----- departments/{deptId} ------------------------------------------
export interface DepartmentDoc {
  nameTh: string;
  nameEn: string;
  isActive: boolean;
  createdAt: Ts;
  updatedAt: Ts;
}

// ----- courses/{courseId} -------------------------------------------
export interface CourseDoc {
  programId: string;
  code: string;
  nameTh: string;
  nameEn: string;
  creditStructure: string; // e.g. "2(2-0-4)"
  credits: number;
  type: CourseType;
  yearOfStudy?: number; // 1..6 — study-plan year
  semester?: Semester | null; // study-plan semester
  isActive: boolean;
  createdAt: Ts;
  updatedAt: Ts;
}

// ----- offerings/{offeringId} ---------------------------------------
export interface OfferingDoc {
  courseId: string;
  programId: string; // denormalized for rules + queries
  courseCode: string; // denormalized for list views
  courseNameTh: string;
  courseNameEn: string;
  academicYear: number; // Buddhist year, e.g. 2568
  semester: Semester;
  section: string;
  /**
   * Optional — added 2026-06. Thesis/dissertation installment
   * (ส่วนที่/ครั้งที่ลงทะเบียน), 1–6. A thesis shares one 7-digit course code
   * but is registered in credit blocks across terms, each block separately
   * analyzed + assessed. Folded into the offering ID only when > 1 (P2..P6),
   * so ordinary coursework and "part 1" keep their existing
   * `${courseId}_${year}_${sem}_${section}` id. Missing/1 = ordinary offering.
   */
  part?: number | null;
  lecturerId: string | null;
  lecturerEmail: string | null;
  /** Pending lecturer assignment before the allowlisted person first signs in. */
  pendingLecturerEmail?: string | null;
  pendingLecturerAllowlistId?: string | null;
  hasExamAssessment: boolean; // drives rubric item 3.4 applicability
  assignedPloNumbers: number[]; // PLOs this offering is responsible for
  status: OfferingStatus;
  previousOfferingId: string | null; // carry-forward link
  latestAiReportId: string | null;
  /** AI analysis attempts are capped per offering. Missing count = 0 used. */
  analysisAttemptLimit?: number;
  analysisAttemptCount?: number;
  assessmentId: string | null;
  /**
   * Visibility flag. Cascaded from the parent program/course's lifecycle —
   * when set to false, the offering is hidden from lecturer and assessor
   * workspaces. Reversible (program/course restore re-activates).
   */
  isActive?: boolean;
  createdAt: Ts;
  updatedAt: Ts;
  createdBy: string;
  updatedBy: string;
}

// ----- offerings/{id}/aiReports/{reportId} --------------------------
export interface AiReportDoc {
  offeringId: string;
  version: number;
  academicYear: number;
  semester: Semester;
  status: AiReportStatus;
  promptTemplate: 'CLAUDE.master.md' | 'CLAUDE.undergrad.md';
  geminiModel: string;
  geminiRequestId: string | null;
  inputTokenCount: number | null;
  outputTokenCount: number | null;
  /** Generated PDF report in Firebase Storage. */
  reportStoragePath: string | null; // gs path within the bucket
  reportDownloadUrl: string | null; // signed/public download URL
  logSheetRowId: string | null;
  /** Parsed sections 1..4 for in-app rendering. */
  structuredOutput: Record<string, unknown> | null;
  /** Deterministic grade stats computed in code, not by Gemini. */
  gradeStats: Record<string, unknown> | null;
  errorMessage: string | null;
  startedAt: Ts | null;
  completedAt: Ts | null;
  createdAt: Ts;
  createdBy: string;
}

// ----- offerings/{id}/assessments/{assessmentId} --------------------
export interface RubricItemComment {
  strengths?: string;
  improvements?: string;
}

export interface AssessmentDoc {
  offeringId: string;
  aiReportId: string;
  assessorId: string;
  assessorName: string;

  /** The 7 official rubric items. `na` only valid for item34 when the
   *  offering has no exam-based assessment. */
  scores: {
    item1Clo: RubricScore;
    item21Content: RubricScore;
    item22Methods: RubricScore;
    item31AssessmentMethods: RubricScore;
    item32AssessmentForms: RubricScore;
    item33Proportions: RubricScore;
    item34ExamQuality: RubricScore;
  };

  /** Server-computed on write (Firestore has no generated columns). */
  totalScore: number;
  maxScore: number;
  percentScore: number;
  band: AssessmentBand;

  comments: Partial<Record<keyof AssessmentDoc['scores'], RubricItemComment>>;
  sectionComments: { section: string; text: string }[];
  generalNotes: string | null;

  /** Combined report PDF (AI analysis + assessor form), in Firebase Storage. */
  signedPdfStoragePath: string | null;
  signedPdfUrl: string | null;
  signedAt: Ts | null;
  isLocked: boolean;
  /**
   * How this offering was signed off (added 2026-06). The durable discriminator
   * the reports/dashboard use for committee-only metrics, since a self-only
   * sign-off later becomes verification_review/verified and loses its entry
   * status. Missing = 'committee' (legacy / normal committee assessment).
   *  - `committee`      full 7-item committee assessment
   *  - `self_only`      signed off on the lecturer's self-assessment only
   *  - `documents_only` closed with documents only (no analysis/assessment)
   */
  signOffKind?: SignOffKind;
  /** The program's assessment committee captured at sign-off (name + Thai
   *  position), shown in the cover of the combined + final reports. */
  committeeSnapshot?: { name: string; position: string }[];
  followUpStatus: 'pending_review_next_semester' | 'implemented' | 'not_implemented' | null;

  createdAt: Ts;
  updatedAt: Ts;
}

// ----- offerings/{id}/selfAssessment/self ---------------------------
/**
 * The lecturer's self-assessment, recorded against the same 7 rubric items
 * before the offering is sent to the assessor. Stored as a single well-known
 * document (`self`). It is purely the lecturer's view — it never feeds the
 * official rubric result, sign-off, reports, or verification. Instead it seeds
 * the assessor's form (when no assessor assessment exists yet) and is shown to
 * the assessor as a read-only reference.
 */
export interface SelfAssessmentDoc {
  offeringId: string;
  scores: AssessmentDoc['scores'];
  comments: Partial<Record<keyof AssessmentDoc['scores'], RubricItemComment>>;
  generalNotes: string | null;
  lecturerId: string;
  lecturerName: string;
  /** True once the lecturer has sent the offering for assessment; the
   *  self-assessment is then frozen (read-only). */
  isSubmitted: boolean;
  submittedAt: Ts | null;
  createdAt: Ts;
  updatedAt: Ts;
}

// ----- offerings/{id}/verifications/{verificationId} ----------------
export interface VerificationDoc {
  offeringId: string;
  programId: string; // denormalized for rules
  aiReportId: string | null;
  assessmentId: string | null;
  verifierId: string;
  verifierName: string;
  decision: VerificationDecision;
  committeeNotes: string | null;
  requiredActions: string | null;
  finalPdfStoragePath: string | null;
  finalPdfUrl: string | null;
  signedAt: Ts | null;
  isLocked: boolean;
  createdAt: Ts;
  updatedAt: Ts;
}

// ----- implementationReviews/{reviewId} -----------------------------
export interface ImplementationReviewDoc {
  previousAssessmentId: string;
  previousOfferingId: string;
  newOfferingId: string;
  programId: string; // denormalized for rules
  decision: ImplementationDecision;
  reviewerId: string;
  reviewerName: string;
  notes: string | null;
  reviewedAt: Ts;
}

// ----- notifications/{notificationId} -------------------------------
export interface NotificationDoc {
  recipientId: string;
  type: string;
  title: string;
  body: string | null;
  relatedOfferingId: string | null;
  emailSentAt: Ts | null;
  readAt: Ts | null;
  createdAt: Ts;
}

// ----- offerings/{id}/followUpReview/review -------------------------
/**
 * Per-item follow-up recorded by the assessor on the *current* offering.
 * Shows whether each improvement recommendation from the previous semester's
 * assessment was implemented.  Stored as a single well-known document
 * (`review`) so it can be upserted without generating multiple versions.
 * Distinct from `ImplementationReviewDoc`, which is the committee's overall
 * sign-off on the *previous* offering.
 */
export interface FollowUpReviewDoc {
  previousOfferingId: string;
  previousAssessmentId: string;
  programId: string;
  itemDecisions: Partial<Record<keyof AssessmentDoc['scores'], ImplementationDecision>>;
  itemComments?: Partial<Record<keyof AssessmentDoc['scores'], string>>;
  notes: string | null;
  reviewerId: string;
  reviewerName: string;
  // Locked when the assessor signs off the current assessment — the follow-up
  // review is frozen alongside the assessment and can no longer be edited.
  isLocked?: boolean;
  updatedAt: Ts;
}

// ----- auditLog/{logId} ---------------------------------------------
export interface AuditLogDoc {
  occurredAt: Ts;
  actorId: string | null;
  actorEmail: string | null;
  action: string; // 'create' | 'update' | 'delete' | 'sign_off' | 'status_change' | ...
  entityType: string; // collection name
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

// ----- assessmentSummaryReports/{reportId} --------------------------
export type ReportScope = 'semester' | 'annual';
/** A report covers one academic program, or all programs (school-wide). */
export type ReportCoverage = 'program' | 'all';
/** Sentinel academicProgramId for school-wide (all-programs) reports. */
export const ALL_PROGRAMS_ID = '__ALL__';
export type ReportStatus =
  | 'draft' // created; AI synthesis not yet run
  | 'synthesizing' // AI synthesis in progress
  | 'synthesized' // aiSynthesis ready; PDF/DOCX not yet rendered
  | 'rendering' // PDF/DOCX generation in progress
  | 'ready' // artifacts available
  | 'failed';

export interface ReportCommitteeMember {
  name: string;
  role: string; // ประธานกรรมการ / กรรมการ / กรรมการและเลขานุการ / ผู้ทรงคุณวุฒิ
  /** Linked user id when chosen from the directory; free-typed names omit it. */
  uid?: string;
}

/** One assessed-or-not offering captured at report-generation time. */
export interface ReportCourseRow {
  offeringId: string;
  courseCode: string;
  courseNameTh: string;
  courseNameEn: string;
  /** Thesis installment (2–6); null/absent for ordinary offerings. */
  part?: number | null;
  semester: Semester;
  lecturerName: string | null;
  assessed: boolean;
  band: AssessmentBand | null;
  percentScore: number | null;
  /** Offering status — included for all-programs course listings. */
  status?: string;
  /** Academic year — included for all-programs (annual) course listings. */
  academicYear?: number;
  /** Owning academic program — set on all-programs reports for grouping. */
  academicProgramId?: string;
  academicProgramCode?: string;
  academicProgramName?: string;
}

/** Per-program rollup row for the all-programs (school-wide) report. */
export interface ProgramRollupRow {
  academicProgramId: string;
  code: string;
  name: string;
  totalOfferings: number;
  assessedOfferings: number;
  assessedPercent: number; // 0–100, one decimal
  avgScorePercent: number | null; // mean of assessed courses' percent
  band: AssessmentBand | null;
}

/** Aggregated commentary for one of the 7 rubric topics. */
export interface ReportTopicSummary {
  key: string; // rubric item key, e.g. item1Clo
  number: string; // '1', '2.1', ...
  labelTh: string;
  strengths: string[];
  improvements: string[];
  /** Mean of assessor scores (1–3) across assessed courses; null if all N/A. */
  averageScore?: number | null;
  /** How many assessed courses contributed a numeric (non-N/A) score. */
  scoredCount?: number;
}

export interface ReportSnapshot {
  totalOfferings: number;
  assessedOfferings: number;
  percent: number; // 0–100, one decimal
  bandDistribution: { improve: number; good: number; excellent: number };
  /** Mean of assessed courses' overall percent scores; null if none assessed. */
  overallAveragePercent?: number | null;
  courseRows: ReportCourseRow[];
  /** Section 3.1 — aggregated from assessor comments per rubric topic. */
  assessorTopicSummary: ReportTopicSummary[];
  /** All-programs reports only — per-program rollup for the §2 table. */
  programRollup?: ProgramRollupRow[];
}

export interface AssessmentSummaryReportDoc {
  /** Owning academic program, or ALL_PROGRAMS_ID for school-wide reports. */
  academicProgramId: string;
  academicProgramLabel: string; // denormalized "code — nameTh" (or "ทุกหลักสูตร")
  coverage: ReportCoverage;
  academicYear: number; // Buddhist year
  scope: ReportScope;
  semester: Semester | null; // null for annual scope

  /** Manually supplied by the director/admin at creation time. */
  header: {
    venue: string;
    /** Formatted Thai display string derived from the structured fields below. */
    meetingDateTime: string;
    /** Structured meeting inputs (added 2026-06). */
    meetingDate?: string; // yyyy-mm-dd (Gregorian)
    meetingStartTime?: string; // HH:mm
    meetingEndTime?: string; // HH:mm
    committee: ReportCommitteeMember[];
  };

  /** Frozen data the report renders from (computed at create/regenerate). */
  snapshot: ReportSnapshot;

  /** Section 3.2 — Gemini-synthesized cross-course suggestions (Phase 3). */
  aiSynthesis: ReportTopicSummary[] | null;

  /** Section 3.1 — Gemini synthesis of assessor comments into an overall
   *  per-topic view. The raw comments stay in snapshot.assessorTopicSummary
   *  (audit trail + fallback when synthesis is missing or failed). */
  assessorSynthesis?: ReportTopicSummary[] | null;

  /** True once a report has been generated — gates program directors to one
   *  generation per row. Admins bypass it; an admin reset clears it. */
  directorLocked?: boolean;

  status: ReportStatus;
  pdfStoragePath: string | null;
  pdfUrl: string | null;
  docxStoragePath: string | null;
  docxUrl: string | null;
  generatedAt: Ts | null;

  createdAt: Ts;
  updatedAt: Ts;
  createdBy: string;
  updatedBy: string;
}

// ----- Rubric scoring helper ----------------------------------------
/** Grade bands from a percent: <70 improve, 70–79 good, 80–100 excellent. */
export function bandFromPercent(percent: number): AssessmentBand {
  return percent >= 80 ? 'excellent' : percent >= 70 ? 'good' : 'improve';
}

/** Band for a mean topic score on the 1–3 scale (score/3 → percent). */
export function bandFromScore(score: number): AssessmentBand {
  return bandFromPercent((score / 3) * 100);
}

/**
 * Computes total/max/percent/band for an assessment.
 * `na` items are excluded from both numerator and denominator.
 * Grade bands: <70 improve, 70–79 good, 80–100 excellent.
 */
export function computeRubricResult(scores: AssessmentDoc['scores']): {
  totalScore: number;
  maxScore: number;
  percentScore: number;
  band: AssessmentBand;
} {
  const values = Object.values(scores);
  let total = 0;
  let max = 0;
  for (const v of values) {
    if (v === 'na') continue;
    total += v;
    max += 3;
  }
  const percent = max === 0 ? 0 : Math.round((1000 * total) / max) / 10;
  const band: AssessmentBand =
    percent >= 80 ? 'excellent' : percent >= 70 ? 'good' : 'improve';
  return { totalScore: total, maxScore: max, percentScore: percent, band };
}
