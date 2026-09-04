/** Coerce colloquial / AM-PM times to HH:MM. Unparseable → fallback. */

const CN_HOUR: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function pad(h: number, m: number): string {
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function coerceAgentTime(raw: string, fallback = "09:00"): string {
  const s = raw.trim();
  if (!s) return fallback;

  const hmAm = /^(\d{1,2}):(\d{2})\s*(am|pm)?$/i.exec(s);
  if (hmAm) {
    let h = Number(hmAm[1]);
    const m = Number(hmAm[2]);
    const ap = hmAm[3]?.toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) return pad(h, m);
  }

  const compact = /^(\d{1,2})\s*(am|pm)$/i.exec(s);
  if (compact) {
    let h = Number(compact[1]);
    const ap = compact[2].toLowerCase();
    if (ap === "pm" && h < 12) h += 12;
    if (ap === "am" && h === 12) h = 0;
    if (h >= 0 && h <= 23) return pad(h, 0);
  }

  const cnHalf = /(?:早上|上午|凌晨)?([一二三四五六七八九十两]+)点半/.exec(s);
  if (cnHalf) {
    const h = chineseHour(cnHalf[1]);
    if (h != null) return pad(h, 30);
  }
  const cnHour = /(?:早上|上午|凌晨)?([一二三四五六七八九十两]+)点(?!半)/.exec(s);
  if (cnHour) {
    const h = chineseHour(cnHour[1]);
    if (h != null) return pad(h, 0);
  }

  return fallback;
}

function chineseHour(token: string): number | null {
  if (token === "两") return 2;
  if (token === "十") return 10;
  if (token.startsWith("十") && token.length === 2) {
    const ones = CN_HOUR[token[1]!];
    return ones != null ? 10 + ones : null;
  }
  return CN_HOUR[token] ?? null;
}
