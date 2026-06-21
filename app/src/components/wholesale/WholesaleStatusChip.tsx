import { STATUS_LABELS, STATUS_PIN_COLORS, type WholesaleLeadStatus } from '../../lib/wholesaleZones';

export function WholesaleStatusChip({ status }: { status: WholesaleLeadStatus | string }) {
  const key = status as WholesaleLeadStatus;
  const color = STATUS_PIN_COLORS[key] || '#9ca3af';
  const label = STATUS_LABELS[key] || status;
  return (
    <span
      className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white"
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}
