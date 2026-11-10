// PRD 13: money keyword detector, case-insensitive, on all free text. A match holds the request for a coordinator.
// Short words match as whole words only, so "persons" or "coffee" do not trip "rs" or "fee".
const PATTERNS: RegExp[] = [
  /₹/u,
  /\brs\.?(?=\s|\d|$)/iu,
  /\brupees?\b/iu,
  /\bupi\b/iu,
  /\bg\s?pay\b/iu,
  /\bpaytm\b/iu,
  /\bphone\s?pe\b/iu,
  /\baccount\s*(no|number)\b/iu,
  /\bifsc\b/iu,
  /\bcharges?\b/iu,
  /\bfees?\b/iu,
  /\bpayments?\b/iu,
];

export function mentionsMoney(...texts: (string | null | undefined)[]): boolean {
  return texts.some((t) => !!t && PATTERNS.some((p) => p.test(t)));
}
