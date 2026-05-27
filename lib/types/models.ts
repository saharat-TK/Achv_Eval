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
  | 'assessed'
  | 'verification_review'
  | 'verified'
  | 'needs_follow_up'
  | 'pending_review_next_semester'
  | 'implemented'
  | 'not_implemented';
export type AiReportStatus = 'queued' | 'running' | 'succeeded' | 'failed';
export type RubricScore = 1 | 2 | 3 | 'na';
export type AssessmentBand = 'improve' | 'good' | 'excellent';
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
    lecturerOf?: string[]; // curriculum ids
    /** Academic-program-scope role arrays (`academicPrograms/{id}` ids). */
    directorOfAcademicPrograms?: string[];
    assessorOfAcademicPrograms?: string[];
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
  createdAt: Ts;
  updatedAt: Ts;
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
  followUpStatus: 'pending_review_next_semester' | 'implemented' | 'not_implemented' | null;

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

// ----- Rubric scoring helper ----------------------------------------
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
