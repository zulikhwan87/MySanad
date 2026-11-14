import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS, STATUS_TONE } from '@/lib/teacher/status';
import type { VerificationStatus } from '@/types/mysanad';

export function StatusBadge({ status }: { status: VerificationStatus }) {
  return <Badge variant={STATUS_TONE[status]}>{STATUS_LABELS[status]}</Badge>;
}
