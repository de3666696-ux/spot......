const HOSTS = [
  "https://data-api.binance.vision/api/v3",
  "https://api.binance.us/api/v3",
  "https://api.binance.com/api/v3",
];

export const INTERVALS = [
  { id: "1h", label: "1 h" },
  { id: "4h", label: "4 h" },
  { id: "1d", label: "1 día" },
  { id: "1w", label: "1 semana" },
];

export async function fetchKlines(symbol, interval = "1d", limit = 500) {
  const sym = String(symbol).toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!sym) throw new Error("Símbolo vacío");
  const pairs = [sym, sym.endsWith("USDT") ? sym : `${sym}USDT`];
  let lastErr;
  for (const host of HOSTS) {
    for (const pair of [...new Set(pairs)]) {
      try {
        const url = `${host}/klines?symbol=${pair}&interval=${interval}&limit=${Math.min(limit, 1000)}`;
        const res = await fetch(url);
        if (res.status === 451) {
          lastErr = new Error("GEO_BLOCK");
          continue;
        }
        if (!res.ok) {
          lastErr = new Error(res.status === 400 ? `Símbolo no válido (${pair})` : `Binance ${res.status}`);
          continue;
        }
        const raw = await res.json();
        if (!Array.isArray(raw) || raw.length < 10) continue;
        return raw.map((k) => ({
          openTime: k[0], open: +k[1], high: +k[2], low: +k[3],
          close: +k[4], volume: +k[5], closeTime: k[6],
        }));
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
      }
    }
  }
  throw lastErr || new Error("No se pudieron obtener velas");
}
