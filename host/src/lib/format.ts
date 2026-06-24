export function formatSgd(amount: number): string {
  return `S$${amount.toLocaleString("en-SG", { maximumFractionDigits: 0 })}`;
}
