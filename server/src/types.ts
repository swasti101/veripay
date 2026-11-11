// Core domain types for VeriPay. Persisted in a JSON document store (see db.ts).

export type Role = 'client' | 'freelancer' | 'expert';
export type Party = 'client' | 'freelancer';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  passwordHash?: string; // scrypt-hashed (undefined for demo accounts)
  emailVerifiedAt?: string | null;
  paypalEmail?: string; // payout receiver (freelancer/expert onboarding)
  payoutOnboarded?: boolean;
  isDemo?: boolean;
  createdAt: string;
  lastLoginAt?: string;
}

export interface VerificationToken {
  token: string;
  userId: string;
  purpose: 'verify_email' | 'password_reset' | 'invite';
  payload?: Record<string, string>;
  expiresAt: string;
  usedAt?: string;
}

export interface ExpertProfile {
  userId: string;
  expertise: string[]; // tags e.g. frontend, backend, design, qa, content
  headline: string;
  experience: string;
  credentialStatus: 'SIMULATED_DEMO_PROFILE' | 'PENDING_VERIFICATION' | 'VERIFIED';
  credentialNote: string;
  reviewsCompleted: number;
  rating: number | null;
  conflicts: string[]; // user ids of people they have a relationship with
  isSimulated: boolean;
}

export type VerificationStatus =
  | 'PASS'
  | 'PARTIAL'
  | 'FAIL'
  | 'UNVERIFIED'
  | 'NEEDS_CLARIFICATION'
  | 'OUT_OF_SCOPE';

export type EvidenceKind = 'visual' | 'functional' | 'document';

export interface Requirement {
  id: string; // REQ-01
  sowRef: string; // "§2.1"
  title: string;
  description: string;
  expectedOutcome: string;
  acceptanceCriteria: string[];
  deliverable: string;
  milestoneId: string;
  evidenceRequired: EvidenceKind[];
  category: string; // frontend | backend | design | content | qa
  amount?: number | null; // optional pre-agreed payment unit within the milestone
  ambiguity?: string | null; // flagged unclear wording
  clarification?: string | null; // approved clarification text
  status: VerificationStatus; // current verification status (runtime, from last QA)
}

export interface Milestone {
  id: string; // M1
  title: string;
  description: string;
  startDate: string;
  dueDate: string;
  amount: number;
  dependsOn: string[];
  owner: Party;
}

export interface Extraction {
  scope: string;
  deliverables: string[];
  responsibilities: { client: string[]; freelancer: string[] };
  dependencies: string[];
  exclusions: string[];
  assumptions: string[];
  budget: number | null;
  advanceAmount: number | null;
  paymentTerms: string;
  ambiguities: { requirementId?: string; text: string; askParty: Party }[];
  source: string; // "anthropic:claude-…" | "gemini:…" | "heuristic"
}

export interface AgreementVersion {
  id: string;
  version: number;
  status: 'DRAFT' | 'APPROVED' | 'SUPERSEDED';
  sowText: string;
  extraction: Extraction;
  requirements: Requirement[];
  milestones: Milestone[];
  budget: number;
  advanceAmount: number;
  currency: string;
  fundingPlan: FundingPlan | null;
  partialPaymentRule: 'PER_REQUIREMENT_AMOUNTS' | 'MUTUAL_AGREEMENT_ONLY';
  expertReview: {
    mode: 'ADVISORY'; // default demo — expert result is a recommendation both parties acknowledge
    panelSize: number;
    quorum: number;
    feePerReview: number;
    feePayer: 'client' | 'freelancer' | 'split';
  };
  platformFeePercent: number; // % deducted from freelancer payouts and expert fees (SaaS revenue)
  approvals: { client: string | null; freelancer: string | null };
  createdBy: string;
  createdAt: string;
  changeSummary: string;
  scopeChangeId?: string;
}

export type FundingOption = 'ADVANCE' | 'PARTIAL' | 'FULL';
export interface FundingPlan {
  option: FundingOption;
  committedMilestones: string[]; // milestone ids committed up front (PARTIAL/FULL)
  chosenBy: string;
  chosenAt: string;
  aiRecommendation?: { option: FundingOption; rationale: string };
}

export type FundingStatus =
  | 'FUNDING_REQUIRED'
  | 'FUNDING_PENDING'
  | 'AUTHORIZED'
  | 'CAPTURED'
  | 'AWAITING_DISBURSEMENT'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'PAYMENT_FAILED'
  | 'REFUNDED'
  | 'DISPUTED';

export type WorkStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED'
  | 'QA_COMPLETE'
  | 'IN_EXPERT_REVIEW'
  | 'REVISION_REQUESTED'
  | 'ACCEPTED'
  | 'CLOSED';

export interface MilestoneState {
  milestoneId: string;
  fundingStatus: FundingStatus;
  workStatus: WorkStatus;
  authorized: number;
  captured: number;
  paid: number;        // net disbursed to the freelancer (gross minus platform fee)
  platformFee: number; // retained by the platform; paid + platformFee settles the gross
  underReview: number;
  authorizationId?: string;
  authorizationExpires?: string;
  honorPeriodEnds?: string;
}

export interface Project {
  id: string;
  title: string;
  description: string;
  category: string;
  createdBy: string;
  initiatorRole: Party;
  clientId: string | null;
  freelancerId: string | null;
  invite: { code: string; role: Party; email: string; status: 'PENDING' | 'ACCEPTED' } | null;
  status: 'DRAFT' | 'NEGOTIATING' | 'ACTIVE' | 'COMPLETED';
  agreementVersions: AgreementVersion[];
  activeAgreementId: string | null; // last APPROVED version
  draftAgreementId: string | null; // version being negotiated
  milestoneStates: MilestoneState[];
  advance: { status: FundingStatus; amount: number; paid: number; platformFee: number };
  isDemo: boolean;
  demoLabel?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Evidence {
  id: string;
  kind: 'screenshot' | 'file' | 'url' | 'kernel_trace' | 'note';
  label: string;
  path?: string; // served path under /evidence
  mime?: string;
  text?: string;
  source: 'freelancer' | 'kernel' | 'kernel_demo_adapter' | 'client' | 'seed';
}

export interface Submission {
  id: string;
  projectId: string;
  milestoneId: string;
  submittedBy: string;
  url: string | null;
  notes: string;
  claims: { requirementId: string; note: string }[];
  evidence: Evidence[];
  authorization: { granted: boolean; scope: string; credentialsProvided: boolean } | null;
  revision: number;
  createdAt: string;
}

export interface KernelRun {
  // KERNEL_LIVE: Kernel cloud browser. LOCAL_BROWSER: the same script on a Chromium on this
  // server — real clicks and screenshots, but explicitly not Kernel. DEMO_ADAPTER: static HTTP only.
  mode: 'KERNEL_LIVE' | 'LOCAL_BROWSER' | 'DEMO_ADAPTER_HTTP_FETCH' | 'SKIPPED';
  note: string;
  sessionId?: string;
  liveViewUrl?: string;
  actions: { at: string; action: string; detail: string; ok: boolean }[];
  /** The agent's journey, in order: what it did, what it saw, and a capture of the moment. */
  steps?: { n: number; kind: 'open' | 'resize' | 'navigate' | 'type' | 'select' | 'click' | 'inspect'; what: string; found: string; ok: boolean; url: string; shot?: string }[];
  pages: { url: string; title: string; viewport: string; headings: string[]; signals: Record<string, boolean | number | string> }[];
  consoleErrors: string[];
  screenshots: Evidence[];
  error?: string;
}

export interface QAResult {
  requirementId: string;
  expected: string;
  actual: string;
  evidence: string[];
  explanation: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  nextAction: string;
  status: VerificationStatus;
  guardrail?: string; // note if deterministic guardrail changed the AI status
}

export interface QARun {
  id: string;
  projectId: string;
  milestoneId: string;
  submissionId: string;
  createdAt: string;
  kernel: KernelRun;
  vision: { source: string; findings: { requirementId: string; observation: string }[]; note: string };
  text: { source: string; findings: { requirementId: string; observation: string }[]; note: string };
  domainAgents: { agent: string; findings: string[] }[];
  results: QAResult[];
  mediatorSummary: string;
  overall: 'COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'INCOMPLETE' | 'DISPUTED' | 'UNVERIFIABLE';
  aiSource: string;
  status: 'RUNNING' | 'COMPLETE' | 'ERROR';
  error?: string;
  isSeed?: boolean;
}

export type FeedbackCategory =
  | 'SOW_DISSATISFACTION'
  | 'QUALITY_CONCERN'
  | 'SUBJECTIVE_PREFERENCE'
  | 'OUT_OF_SCOPE_REQUEST'
  | 'UNCLEAR';

export interface Feedback {
  id: string;
  projectId: string;
  milestoneId: string;
  submissionId: string;
  rating: 'FULLY_SATISFIED' | 'PARTIALLY_SATISFIED' | 'NOT_SATISFIED';
  items: { text: string; requirementId: string | null }[];
  additional: string;
  classification: { text: string; requirementId: string | null; category: FeedbackCategory; rationale: string }[];
  aiSource: string;
  createdAt: string;
}

export type ExpertVote = 'COMPLIANT' | 'PARTIALLY_COMPLIANT' | 'NOT_COMPLIANT' | 'INSUFFICIENT_EVIDENCE';

export interface ExpertReview {
  id: string;
  projectId: string;
  milestoneId: string;
  requirementIds: string[];
  triggers: string[];
  requestedBy: string; // user id or 'ai-coordinator'
  status: 'AWAITING_FEE_ACK' | 'VOTING' | 'CLOSED' | 'INCONCLUSIVE';
  panelSize: number;
  quorum: number;
  fee: number;
  feePayer: 'client' | 'freelancer' | 'split';
  feeAcks: { client: string | null; freelancer: string | null };
  feeFunding: { party: 'client' | 'freelancer'; amount: number; txId: string | null; status: 'REQUIRED' | 'PAID' }[];
  closesAt: string;
  assignments: {
    expertId: string;
    status: 'INVITED' | 'ACCEPTED' | 'DECLINED' | 'SUBMITTED';
    conflictDeclaration: string | null;
    feeDisclosedAt: string;
    acceptedAt?: string;
    feePaymentId?: string;
  }[];
  excludedExperts: { expertId: string; reason: string }[];
  votes: {
    expertId: string;
    requirementId: string;
    vote: ExpertVote;
    reasoning: string;
    evidence: string;
    recommendation: string;
    submittedAt: string;
    simulated: boolean; // cast by/for a SIMULATED demo expert profile
    generated: boolean; // auto-generated by the demo vote simulator (not typed by a person)
  }[];
  packet: any; // frozen snapshot of evidence shown to every reviewer
  result: null | {
    perRequirement: {
      requirementId: string;
      tally: Record<ExpertVote, number>;
      outcome: ExpertVote | 'INCONCLUSIVE';
      minority: { expertId: string; vote: ExpertVote; reasoning: string }[];
    }[];
    summary: string;
  };
  createdAt: string;
  closedAt?: string;
}

export interface AllocationLine {
  requirementId: string;
  title: string;
  status: string; // effective status after QA/expert/feedback
  basis: string;
  amount: number | null;
  treatment: 'RELEASE' | 'HOLD' | 'EXCLUDED_OUT_OF_SCOPE' | 'NEEDS_AGREEMENT';
}

export interface Allocation {
  id: string;
  projectId: string;
  milestoneId: string;
  milestoneAmount: number;
  releaseType: 'FULL_PAYMENT' | 'PARTIAL_PAYMENT' | 'UNDER_REVIEW' | 'REVISION_REQUIRED';
  eligibleAmount: number;
  disputedAmount: number;
  rule: string; // which row of the decision matrix fired
  explanation: string[];
  lines: AllocationLine[];
  inputs: { qaRunId: string | null; feedbackId: string | null; expertReviewId: string | null; agreementVersion: number };
  approvals: { client: string | null; freelancer: string | null };
  challenges: { by: string; text: string; at: string }[];
  status: 'PROPOSED' | 'APPROVED' | 'CHALLENGED' | 'EXECUTED' | 'SUPERSEDED';
  createdAt: string;
}

export interface PartialSettlement {
  id: string;
  projectId: string;
  milestoneId: string;
  amount: number;
  reason: string;
  proposedBy: string;
  approvals: { client: string | null; freelancer: string | null };
  status: 'PROPOSED' | 'AGREED' | 'DECLINED' | 'EXECUTED';
  createdAt: string;
}

export type TxType =
  | 'ADVANCE_PAYMENT'
  | 'MILESTONE_AUTHORIZATION'
  | 'MILESTONE_CAPTURE'
  | 'FREELANCER_PAYOUT'
  | 'EXPERT_FEE_COLLECTION'
  | 'EXPERT_FEE_PAYOUT'
  | 'PLATFORM_FEE'
  | 'VOID'
  | 'REFUND';

export interface Transaction {
  id: string;
  projectId: string;
  milestoneId: string | null;
  type: TxType;
  amount: number;
  currency: string;
  status: string; // PayPal-reported or simulated status
  mode: 'PAYPAL_SANDBOX' | 'PAYPAL_LIVE' | 'SIMULATED';
  paypal: { orderId?: string; authorizationId?: string; captureId?: string; payoutBatchId?: string; payoutItemId?: string };
  payee?: string;
  initiatedBy: string;
  approvals?: string[];
  allocationId?: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  projectId: string;
  from: string; // user id or agent key
  fromType: 'user' | 'agent';
  agent?: string;
  audience: 'all' | 'client' | 'freelancer';
  kind: 'chat' | 'clarification' | 'notice' | 'escalation' | 'challenge' | 'response' | 'evidence_request';
  text: string;
  ref?: { type: string; id: string };
  createdAt: string;
}

export interface ScopeChange {
  id: string;
  projectId: string;
  requestedBy: string;
  description: string;
  sourceFeedbackId?: string;
  analysis: { outOfScope: boolean; reason: string; relatedRequirements: string[]; source: string };
  freelancerResponse: null | { willing: boolean; cost: number; days: number; note: string; at: string };
  clientDecision: null | { approved: boolean; at: string; note: string };
  status: 'AWAITING_FREELANCER' | 'AWAITING_CLIENT' | 'APPROVED' | 'DECLINED' | 'WITHDRAWN';
  resultingAgreementVersion?: number;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  projectId: string | null;
  actor: string;
  actorType: 'user' | 'agent' | 'system' | 'paypal' | 'kernel';
  action: string;
  details: string;
  refs: { type: string; id: string }[];
  at: string;
}

export interface DB {
  users: User[];
  experts: ExpertProfile[];
  sessions: { token: string; userId: string; createdAt: string; ip?: string }[];
  tokens: VerificationToken[];
  projects: Project[];
  submissions: Submission[];
  qaRuns: QARun[];
  feedback: Feedback[];
  expertReviews: ExpertReview[];
  allocations: Allocation[];
  settlements: PartialSettlement[];
  transactions: Transaction[];
  messages: Message[];
  scopeChanges: ScopeChange[];
  audit: AuditEntry[];
  meta: { seededAt: string | null; version: number };
}
