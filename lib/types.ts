export type SessionKind = "user" | "demo";

export type UserSession = {
  kind: "user";
  userId: string;
  workspaceId: string | null;
  exp: number;
};

export type DemoSession = {
  kind: "demo";
  workspaceId: string;
  demoSessionId: string;
  exp: number;
};

export type Session = UserSession | DemoSession;

export type BatchStatus = "imported" | "queued" | "processing" | "completed" | "failed";

export type JobStatus = "queued" | "validating" | "matching" | "explaining" | "completed" | "failed";

export type InvoiceStatus = "exact" | "partial" | "unpaid" | "ambiguous" | "settled";

export type SuggestionType = "exact" | "partial" | "ambiguous" | "unpaid";

export type SuggestionStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "auto_allocated"
  | "superseded"
  | "left_unresolved";

export type AiStatus = "not_requested" | "pending" | "success" | "unavailable" | "failed";

export type ReviewAction =
  | "confirm"
  | "reject"
  | "leave_unresolved"
  | "manual_allocate"
  | "undo";

export type InvoiceRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  source_file_id: string;
  source_row_number: number;
  invoice_id: string;
  customer_name: string;
  amount_minor: number;
  currency: string;
  due_date: string | null;
  raw_json: string;
};

export type PaymentRow = {
  id: string;
  batch_id: string;
  workspace_id: string;
  source_file_id: string;
  source_row_number: number;
  payment_id: string;
  payer_name: string;
  amount_minor: number;
  currency: string;
  reference: string | null;
  paid_at: string | null;
  raw_json: string;
};

export type Suggestion = {
  id: string;
  batch_id: string;
  workspace_id: string;
  invoice_row_id: string;
  payment_row_id: string | null;
  type: SuggestionType;
  status: SuggestionStatus;
  allocation_amount_minor: number | null;
  rule_reason: string;
  signals_json: string;
  ai_status: AiStatus;
  ai_explanation: string | null;
  ai_evidence_json: string | null;
  ai_action: string | null;
  ai_limitations: string | null;
  ai_provider: string | null;
  ai_model: string | null;
  ai_prompt_version: string | null;
  ai_error: string | null;
  created_at: string;
  updated_at: string;
};

export type Allocation = {
  id: string;
  batch_id: string;
  workspace_id: string;
  invoice_row_id: string;
  payment_row_id: string;
  amount_minor: number;
  source: "automatic" | "review";
  rule_reason: string | null;
  created_by_user_id: string | null;
  created_at: string;
  reversed_at: string | null;
  reversed_by_user_id: string | null;
  review_event_id: string | null;
};

export type ReviewEvent = {
  id: string;
  batch_id: string;
  workspace_id: string;
  invoice_row_id: string;
  payment_row_id: string | null;
  allocation_id: string | null;
  action: ReviewAction;
  amount_minor: number | null;
  note: string | null;
  actor_user_id: string | null;
  actor_label: string;
  created_at: string;
  reverses_event_id: string | null;
  metadata_json: string | null;
};

export type Job = {
  id: string;
  batch_id: string;
  workspace_id: string;
  status: JobStatus;
  stage: string;
  progress: number;
  message: string | null;
  error: string | null;
  retry_count: number;
  max_retries: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
  idempotency_key: string | null;
};

export type BatchSummary = {
  id: string;
  workspace_id: string;
  name: string;
  currency: string;
  status: BatchStatus;
  created_at: string;
  invoice_count: number;
  payment_count: number;
  invoiced_minor: number;
  imported_minor: number;
  confirmed_minor: number;
  outstanding_minor: number;
  exact_count: number;
  partial_count: number;
  unpaid_count: number;
  ambiguous_count: number;
  needs_review_count: number;
  unallocated_payment_count: number;
  unallocated_minor: number;
};

