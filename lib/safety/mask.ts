/** For server logs only: never print a full phone number (PRD 13). "919876543210" -> "********3210". */
export function maskPhone(waId: string): string {
  const digits = String(waId).replace(/\D/g, "");
  return digits.length <= 4 ? "****" : "*".repeat(digits.length - 4) + digits.slice(-4);
}
