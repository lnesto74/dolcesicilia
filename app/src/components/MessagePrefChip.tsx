import {
  MESSAGE_PREF_CHIP_CLASS,
  MESSAGE_PREF_LABELS,
  normalizeMessagePref,
  type MessagePref,
} from '@shared/messagePreferences';

interface MessagePrefChipProps {
  pref?: string | null;
  endOfDayOptin?: boolean | null;
  className?: string;
}

export function MessagePrefChip({ pref, endOfDayOptin, className = '' }: MessagePrefChipProps) {
  const normalized = normalizeMessagePref(pref) as MessagePref;
  if (normalized === 'unset' && !endOfDayOptin) return null;

  return (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {normalized !== 'unset' && (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${MESSAGE_PREF_CHIP_CLASS[normalized]} ${className}`}
        >
          {MESSAGE_PREF_LABELS[normalized]}
        </span>
      )}
      {endOfDayOptin && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border bg-indigo-100 text-indigo-900 border-indigo-300">
          EOD 🌙
        </span>
      )}
    </span>
  );
}
