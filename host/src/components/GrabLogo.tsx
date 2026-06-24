/** Grab wordmark-style logo for review attribution (brand green #00B14F). */
export function GrabLogo({ className = "h-5" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 80 28"
      role="img"
      aria-label="Grab"
      xmlns="http://www.w3.org/2000/svg"
    >
      <text
        x="0"
        y="22"
        fill="#00B14F"
        fontFamily="Inter, Helvetica, Arial, sans-serif"
        fontSize="24"
        fontWeight="700"
        letterSpacing="-0.5"
      >
        Grab
      </text>
    </svg>
  );
}
