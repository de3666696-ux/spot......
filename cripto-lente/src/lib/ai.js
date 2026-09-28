const DEFAULT_BASE = "https://api.x.ai/v1";
const DEFAULT_MODEL = "grok-2-latest";

export function loadAiSettings() {
  try {
    const raw = localStorage.getItem("cripto-lente:ai");
    if (!raw) return { apiKey: "", baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL };
    return { apiKey: "", baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL, ...JSON.parse(raw) };
  } catch {
    return { apiKey: "", baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL };
  }
}

export function saveAiSettings(settings) {
  try {
    localStorage.setItem(
      "cripto-lente:ai",
      JSON.stringify({
        apiKey: settings.apiKey || "",
        baseUrl: settings.baseUrl || DEFAULT_BASE,
        model: settings.model || DEFAULT_MODEL,
      }),
    );
  } catch {}
}

function buildSystemPrompt(ctx) {
  const { coin, scoreStruct, scoreCtx, global, news } = ctx || {};
  const lines = [
    "Eres el asistente de investigación de Cripto Lente.",
    "Respondes en español, claro y directo.",
    "No inventes cifras. Si no están en el contexto, dilo.",
    "No prometas ganancias ni garantices precios futuros.",
    "Distingue entre calidad estructural (fundamentos) y contexto de mercado (timing).",
  ];

  if (global) {
    lines.push(
      "",
      "## Mercado global",
      `- Market cap: ${global.marketCap}`,
      `- Dominancia BTC: ${global.btcDominance}%`,
    );
  }

  if (coin) {
    lines.push(
      "",
      "## Activo analizado",
      `- ${coin.name} (${coin.symbol}) · rank #${coin.rank}`,
      `- Precio: ${coin.price} · 24h: ${coin.change24h}% · 7d: ${coin.change7d}% · 30d: ${coin.change30d}%`,
      `- Market cap: ${coin.marketCap} · Vol 24h: ${coin.volume24h}`,
      `- Desde ATH: ${coin.percentFromAth}%`,
      `- Open source: ${coin.openSource}`,
      coin.description ? `- Descripción: ${String(coin.description).slice(0, 900)}` : null,
    );
  }

  if (scoreStruct) {
    lines.push(
      "",
      "## Score ESTRUCTURAL (calidad del activo)",
      `- ${scoreStruct.total}/100 (${scoreStruct.label})`,
      `- Partes: liquidez ${scoreStruct.parts.liquidez}/30 · tokenomics ${scoreStruct.parts.tokenomics}/25 · proyecto ${scoreStruct.parts.proyecto}/45`,
    );
  }
  if (scoreCtx) {
    lines.push(
      "",
      "## Score CONTEXTO (timing de mercado)",
      `- ${scoreCtx.total}/100 (${scoreCtx.label})`,
      `- Partes: momentum ${scoreCtx.parts.momentum}/40 · valoración ${scoreCtx.parts.valoracion}/35 · régimen ${scoreCtx.parts.regimen}/25`,
    );
  }
  if (news?.length) {
    lines.push("", "## Titulares recientes");
    for (const n of news.slice(0, 6)) lines.push(`- ${n.title}`);
  }

  return lines.filter(Boolean).join("\n");
}

export async function askCoinAi(userMessage, ctx, settings) {
  const apiKey = (settings?.apiKey || "").trim();
  if (!apiKey) throw new Error("NO_KEY");
  const baseUrl = (settings.baseUrl || DEFAULT_BASE).replace(/\/$/, "");
  const model = settings.model || DEFAULT_MODEL;

  const body = {
    model,
    temperature: 0.5,
    messages: [
      { role: "system", content: buildSystemPrompt(ctx) },
      { role: "user", content: userMessage },
    ],
  };

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j.error?.message || JSON.stringify(j).slice(0, 180);
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 401) throw new Error("API key inválida o sin permiso.");
    if (res.status === 429) throw new Error("Límite de la API. Espera un momento.");
    throw new Error(detail || `Error API (${res.status})`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("La API no devolvió texto.");
  return text.trim();
}

export const API_KEY_WARNING =
  "Esta key se guarda en tu navegador. No la compartas ni la subas a un sitio público.";