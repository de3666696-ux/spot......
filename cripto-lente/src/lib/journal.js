const KEY = "cripto-lente:journal:v1";
const MAX = 300;

export function loadJournal() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export function saveJournal(signals) {
  try { localStorage.setItem(KEY, JSON.stringify(signals.slice(0, MAX))); } catch {}
}

export function addSignal(journal, sig) {
  if (journal.some(j => j.id === sig.id)) return journal;
  const entry = { ...sig, status: "pending", outcome: null, resolvedAt: null };
  return [entry, ...journal].slice(0, MAX);
}

export function resolvePending(journal, candlesBySymbol) {
  let changed = false;
  const next = journal.map(s => {
    if (s.status !== "pending") return s;
    const candles = candlesBySymbol[s.symbol];
    if (!candles?.length) return s;
    const after = candles.filter(c => c.openTime > s.detectedAt);
    for (const c of after) {
      if (s.side === "long") {
        if (c.low <= s.stop) { changed = true; return { ...s, status: "loss", outcome: s.stop, resolvedAt: c.openTime }; }
        if (c.high >= s.tp1) { changed = true; return { ...s, status: "win", outcome: s.tp1, resolvedAt: c.openTime }; }
      } else {
        if (c.high >= s.stop) { changed = true; return { ...s, status: "loss", outcome: s.stop, resolvedAt: c.openTime }; }
        if (c.low <= s.tp1) { changed = true; return { ...s, status: "win", outcome: s.tp1, resolvedAt: c.openTime }; }
      }
    }
    return s;
  });
  return changed ? next : journal;
}