/**
 * Repair Swedish letters that were UTF-8 decoded as CP437/CP850 and saved again.
 * "Fläktrum" → "Fl├ñktrum", "utifrån" → "utifr├Ñn".
 */
const REPLACEMENTS: Array<[string, string]> = [
  ["├ñ", "ä"],
  ["├Ñ", "å"],
  ["├à", "Å"],
  ["├ä", "Ä"],
  ["├╢", "ö"],
  ["├░", "ö"],
  ["├Â", "ö"],
  ["├û", "Ö"],
  ["├®", "é"],
  ["├¿", "é"],
  ["Ã¤", "ä"],
  ["Ã¶", "ö"],
  ["Ã¥", "å"],
  ["Ã„", "Ä"],
  ["Ã–", "Ö"],
  ["Ã…", "Å"],
];

export function repairSwedishMojibake(value: string): string {
  let out = value;
  for (const [bad, good] of REPLACEMENTS) {
    if (out.includes(bad)) out = out.split(bad).join(good);
  }
  return out;
}

export function repairMaybe(value: string | null | undefined): string | null {
  if (value == null) return null;
  return repairSwedishMojibake(value);
}
