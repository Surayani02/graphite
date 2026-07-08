/**
 * Subsequence scorer for palette ranking. Zero means "no match"; higher is
 * better; ties break by the caller's input order (Array.sort is stable).
 *
 * Scoring per matched query character: +3 when the match starts a word
 * (index 0 or after a separator), +2 when it directly continues the
 * previous match, +1 otherwise — so "sd" ranks "Save Document" (two word
 * starts) above a scattered match. The final score is scaled and reduced
 * by target length, so "Save" beats "Save Document" for the query "save".
 *
 * Hand-rolled by design (ADR-015): at a dozen builtin commands plus capped
 * node results there is nothing for an indexing library like fuse.js to
 * index, and ~40 auditable lines beat a dependency (three-question test).
 */
export function fuzzyScore(query: string, target: string): number {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return 1;
  const t = target.toLowerCase();
  if (q.length > t.length) return 0;

  let score = 0;
  let searchFrom = 0;
  let lastMatch = -2;
  for (let qi = 0; qi < q.length; qi += 1) {
    const wanted = q.charCodeAt(qi);
    let found = -1;
    for (let ti = searchFrom; ti < t.length; ti += 1) {
      if (t.charCodeAt(ti) === wanted) {
        found = ti;
        break;
      }
    }
    if (found === -1) return 0;

    const previous = t[found - 1];
    if (
      found === 0 ||
      previous === " " ||
      previous === "." ||
      previous === "-" ||
      previous === "_" ||
      previous === "/"
    ) {
      score += 3;
    } else if (found === lastMatch + 1) {
      score += 2;
    } else {
      score += 1;
    }
    lastMatch = found;
    searchFrom = found + 1;
  }

  return Math.max(1, score * 100 - t.length);
}
