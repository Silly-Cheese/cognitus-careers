export const TALENT_PERMISSIONS = Object.freeze({
  APPLICATIONS_SELF: "applications.self",
  PROFILE_SELF: "profile.self",
  NOTIFICATIONS_SELF: "notifications.self",
  REVIEW_QUEUE: "review.queue",
  REVIEW_ASSIGNED: "review.assigned",
  REVIEW_ALL: "review.all",
  REVIEW_SCORE: "review.score",
  REVIEW_RECOMMEND: "review.recommend",
  REVIEW_ASSIGN: "review.assign",
  INTERVIEW_REQUEST: "interview.request",
  INTERVIEW_MANAGE: "interview.manage",
  WORKFLOW_MANAGE: "workflow.manage",
  FORMS_MANAGE: "forms.manage",
  EXECUTIVE_VIEW: "executive.view",
  FINAL_DECISION: "decision.final",
  ACCOUNTS_MANAGE: "accounts.manage",
  AUDIT_READ: "audit.read",
  RECOVERY_MANAGE: "recovery.manage",
  SETTINGS_MANAGE: "settings.manage",
  EXPORTS_MANAGE: "exports.manage"
});

export const TALENT_ROLE_LABELS = Object.freeze({
  applicant: "Applicant",
  reviewer: "Reviewer",
  seniorReviewer: "Senior Reviewer",
  hiringLead: "Hiring Lead",
  executive: "Executive",
  owner: "Owner"
});

const BASE = [
  TALENT_PERMISSIONS.APPLICATIONS_SELF,
  TALENT_PERMISSIONS.PROFILE_SELF,
  TALENT_PERMISSIONS.NOTIFICATIONS_SELF
];

export const TALENT_ROLE_PERMISSIONS = Object.freeze({
  applicant: BASE,
  reviewer: [
    ...BASE,
    TALENT_PERMISSIONS.REVIEW_QUEUE,
    TALENT_PERMISSIONS.REVIEW_ASSIGNED,
    TALENT_PERMISSIONS.REVIEW_SCORE,
    TALENT_PERMISSIONS.REVIEW_RECOMMEND
  ],
  seniorReviewer: [
    ...BASE,
    TALENT_PERMISSIONS.REVIEW_QUEUE,
    TALENT_PERMISSIONS.REVIEW_ASSIGNED,
    TALENT_PERMISSIONS.REVIEW_ALL,
    TALENT_PERMISSIONS.REVIEW_SCORE,
    TALENT_PERMISSIONS.REVIEW_RECOMMEND,
    TALENT_PERMISSIONS.REVIEW_ASSIGN,
    TALENT_PERMISSIONS.INTERVIEW_REQUEST
  ],
  hiringLead: [
    ...BASE,
    TALENT_PERMISSIONS.REVIEW_QUEUE,
    TALENT_PERMISSIONS.REVIEW_ASSIGNED,
    TALENT_PERMISSIONS.REVIEW_ALL,
    TALENT_PERMISSIONS.REVIEW_SCORE,
    TALENT_PERMISSIONS.REVIEW_RECOMMEND,
    TALENT_PERMISSIONS.REVIEW_ASSIGN,
    TALENT_PERMISSIONS.INTERVIEW_REQUEST,
    TALENT_PERMISSIONS.INTERVIEW_MANAGE,
    TALENT_PERMISSIONS.WORKFLOW_MANAGE
  ],
  executive: [
    ...BASE,
    TALENT_PERMISSIONS.REVIEW_QUEUE,
    TALENT_PERMISSIONS.REVIEW_ASSIGNED,
    TALENT_PERMISSIONS.REVIEW_ALL,
    TALENT_PERMISSIONS.REVIEW_SCORE,
    TALENT_PERMISSIONS.REVIEW_RECOMMEND,
    TALENT_PERMISSIONS.REVIEW_ASSIGN,
    TALENT_PERMISSIONS.INTERVIEW_REQUEST,
    TALENT_PERMISSIONS.INTERVIEW_MANAGE,
    TALENT_PERMISSIONS.WORKFLOW_MANAGE,
    TALENT_PERMISSIONS.FORMS_MANAGE,
    TALENT_PERMISSIONS.EXECUTIVE_VIEW,
    TALENT_PERMISSIONS.AUDIT_READ
  ],
  owner: ["*"]
});

export function hasTalentPermission(profile, permission) {
  if (!profile || (profile.accountStatus && profile.accountStatus !== "active")) return false;
  const permissions = TALENT_ROLE_PERMISSIONS[profile.role] || TALENT_ROLE_PERMISSIONS.applicant;
  return permissions.includes("*") || permissions.includes(permission);
}

export function hasAnyTalentPermission(profile, permissions = []) {
  return permissions.some(permission => hasTalentPermission(profile, permission));
}

export function talentRoleLabel(role) {
  return TALENT_ROLE_LABELS[role] || "Applicant";
}
