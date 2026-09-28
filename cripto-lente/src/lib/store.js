const LS_KEY = "cripto-lente:v1";

export function loadStore() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { history: [], watchlist: [], paper: null };
    const parsed = JSON.parse(raw);
    return {
      history: Array.isArray(parsed.history) ? parsed.history : [],
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : [],
      paper: parsed.paper || null,
    };
  } catch {
    return { history: [], watchlist: [], paper: null };
  }
}

export function saveStore(data) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      history: data.history,
      watchlist: data.watchlist,
      paper: data.paper,
    }));
  } catch {}
}