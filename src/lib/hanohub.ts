import type { Database } from "@/integrations/supabase/types";

export type ComplaintStatus = Database["public"]["Enums"]["complaint_status"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const STATUS_LABEL: Record<ComplaintStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  awaiting_information: "Awaiting Information",
  in_progress: "In Progress",
  resolution_proposed: "Resolution Proposed",
  under_resolution_review: "Under Resolution Review",
  challenged: "Challenged",
  reopened: "Reopened",
  escalated: "Escalated",
  closed: "Closed",
};

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";
export const STATUS_TONE: Record<ComplaintStatus, StatusTone> = {
  submitted: "neutral",
  under_review: "info",
  awaiting_information: "warning",
  in_progress: "info",
  resolution_proposed: "warning",
  under_resolution_review: "warning",
  challenged: "danger",
  reopened: "info",
  escalated: "danger",
  closed: "success",
};

export const OPEN_STATUSES: ComplaintStatus[] = (Object.keys(STATUS_LABEL) as ComplaintStatus[]).filter(
  (s) => s !== "closed",
);

export const ALLOWED_EVIDENCE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
export const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

export function validateEvidenceFile(f: { type: string; size: number }): string | null {
  if (!ALLOWED_EVIDENCE_TYPES.includes(f.type)) return "Only JPG, PNG, WEBP or PDF files are allowed.";
  if (f.size > MAX_EVIDENCE_BYTES) return "Each file must be 10 MB or smaller.";
  return null;
}

export function formatDate(d: string) {
  return new Date(d).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
}
