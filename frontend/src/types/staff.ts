export type CaseStatus = 'new' | 'ocr_review' | 'needs_info' | 'manual_review' | 'supervisor_review' | 'completed' | 'returned';
export type Priority = 'high' | 'normal' | 'low';
export type ReviewState = 'unconfirmed' | 'confirmed' | 'corrected' | 'missing';

export type OcrField = {
  key: string;
  label: string;
  value: string;
  confidence: number;
  reviewState: ReviewState;
  warning?: string;
};

export type AuditEntry = {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  before?: string;
  after?: string;
  comment?: string;
};

export type CalculationResult = {
  eligibility: '対象の可能性あり' | '追加情報が必要' | '職員確認が必要' | '対象外';
  selfPaymentLimitYen: number | null;
  estimatedBenefitYen: number | null;
  inputs: { label: string; value: string }[];
  formula: string | null;
  reasons: string[];
  appliedRules: { id: string; title: string; source: string; url?: string }[];
  exceptionCodes: string[];
  missingInformation: string[];
  source: 'api' | 'demo';
};

export type StaffCase = {
  id: string;
  receivedAt: string;
  applicantName: string;
  birthDate: string;
  age: number;
  insurance: string;
  incomeCategory: string;
  serviceMonth: string;
  providerName: string;
  careSetting: '入院' | '外来';
  discipline: '医科' | '歯科';
  program: string;
  claimedAmountYen: number;
  status: CaseStatus;
  priority: Priority;
  requiresAttention: boolean;
  document: {
    filename: string;
    submittedAt: string;
    ocrProvider: string;
    duplicateSuspected: boolean;
    qualityIssues: string[];
  };
  ocrFields: OcrField[];
  calculation: CalculationResult;
  auditLog: AuditEntry[];
};

export type StaffAction = 'ocr_confirmed' | 'needs_review' | 'missing_documents' | 'return' | 'supervisor' | 'complete';
