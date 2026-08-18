export function check(name, pass, weight = 1, note = "") {
  return { name, pass: !!pass, weight, note: note ? String(note).slice(0, 200) : "" };
}

/** Turn a 1-5 judge score into a weighted check (score 5 = full points, 1 = 0). */
export function judgeCheck(name, j, weight = 3) {
  const s = j?.score;
  const frac = s == null ? 0 : (s - 1) / 4;
  return { name, pass: s != null && s >= 4, weight, points: frac * weight, note: `judge ${s ?? "?"}/5 — ${j?.reason ?? ""}`.slice(0, 200), judgeCostUsd: j?.costUsd ?? 0 };
}
