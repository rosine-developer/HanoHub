import { STATUS_LABEL, STATUS_TONE, type ComplaintStatus } from "@/lib/hanohub";
import { cn } from "@/lib/utils";

const tone = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  success: "bg-success/10 text-success",
  danger: "bg-destructive/10 text-destructive",
};

export function StatusBadge({ status }: { status: ComplaintStatus }) {
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium", tone[STATUS_TONE[status]])}>
      {STATUS_LABEL[status]}
    </span>
  );
}
