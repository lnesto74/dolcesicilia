export function GoldDivider({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`} aria-hidden="true">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
      <span className="text-gold text-xs tracking-[0.3em]">◆</span>
      <span className="h-px flex-1 bg-gradient-to-r from-transparent via-gold to-transparent" />
    </div>
  );
}
