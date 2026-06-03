/**
 * HüCem Hattı — merkezi API servis katmanı
 * Tüm backend çağrıları buradan yapılır.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

async function get(path) {
  try {
    const r = await fetch(`${BASE}${path}`);
    if (!r.ok) return null;
    return r.json();
  } catch {
    return null;
  }
}

export const api = {
  // ── Oyuncu arama ────────────────────────────────────────────────────────────
  searchPlayers: (q) =>
    get(`/players/search?q=${encodeURIComponent(q)}`).then(r => r ?? []),

  // ── Oyuncu profili (per90, club, lig) ───────────────────────────────────────
  getPlayer: (id) => get(`/player/${id}`),

  // ── Oyuncu fotoğrafı URL'si ──────────────────────────────────────────────────
  getPlayerPhoto: (id) =>
    get(`/player/${id}/photo`).then(r => r?.url ?? null),

  // ── Şutlar ──────────────────────────────────────────────────────────────────
  getPlayerShots: (id, turnuva = null) => {
    const qs = turnuva ? `?turnuva=${encodeURIComponent(turnuva)}` : "";
    return get(`/player/${id}/shots${qs}`).then(r => r ?? []);
  },

  // ── Yüzdelik dilimler ────────────────────────────────────────────────────────
  getPlayerPercentiles: (id) => get(`/player/${id}/percentiles`),

  // ── Maç listesi ─────────────────────────────────────────────────────────────
  getPlayerMatches: (id, turnuva = null) => {
    const qs = turnuva ? `?turnuva=${encodeURIComponent(turnuva)}` : "";
    return get(`/player/${id}/matches${qs}`).then(r => r ?? []);
  },

  // ── Katıldığı turnuvalar ─────────────────────────────────────────────────────
  getPlayerCompetitions: (id) =>
    get(`/player/${id}/competitions`).then(r => r ?? []),

  // ── Turnuva bazlı özet istatistikler ────────────────────────────────────────
  getPlayerCompetitionStats: (id) =>
    get(`/player/${id}/competition-stats`).then(r => r ?? []),

  // ── Benzer oyuncular ────────────────────────────────────────────────────────
  getSimilarPlayers: (id, { topN = 5, samePosition = false, minMinutes = 90 } = {}) =>
    get(`/player/${id}/similar?top_n=${topN}&same_position_only=${samePosition}&min_minutes=${minMinutes}`)
      .then(r => r ?? []),

  // ── AI içgörüsü ──────────────────────────────────────────────────────────────
  getPlayerInsight: (id) => get(`/player/${id}/insight`),

  // ── Oyuncu arketipi ──────────────────────────────────────────────────────────
  getPlayerArchetype: (id) => get(`/player/${id}/archetype`),

  // ── Takımlar ─────────────────────────────────────────────────────────────────
  getTeams: () => get("/teams").then(r => r ?? []),

  // ── Takım kadrosu ────────────────────────────────────────────────────────────
  getTeamPlayers: (ulke) =>
    get(`/teams/${encodeURIComponent(ulke)}/players`).then(r => r ?? []),

  // ── Ticker liderleri ─────────────────────────────────────────────────────────
  getStatsLeaders: () => get("/stats/leaders").then(r => r ?? []),

  // ── Metrik lider tablosu ─────────────────────────────────────────────────────
  getStatsTop: (metric, limit = 15) =>
    get(`/stats/top?metric=${encodeURIComponent(metric)}&limit=${limit}`).then(r => r ?? []),

  // ── Fikstür takvimi ───────────────────────────────────────────────────────────
  getFixtures: ({ grup, tur, durum, gun, limit = 200 } = {}) => {
    const qs = new URLSearchParams();
    if (grup)  qs.set("grup",  grup);
    if (tur)   qs.set("tur",   tur);
    if (durum) qs.set("durum", durum);
    if (gun)   qs.set("gun",   gun);
    qs.set("limit", limit);
    return get(`/fixtures?${qs}`).then(r => r ?? []);
  },

  // ── Oyuncu piyasa değeri (Transfermarkt) ──────────────────────────────────────
  getPlayerMarket: (id) => get(`/player/${id}/market`),

  // ── Understat xG/xA sezon trendi ─────────────────────────────────────────────
  getPlayerXgTrend: (id) => get(`/player/${id}/xg-trend`).then(r => r ?? []),

  // ── FBref sezonluk istatistikler ─────────────────────────────────────────────
  getPlayerExternalStats: (id) =>
    get(`/player/${id}/external-stats`).then(r => r ?? []),

  // ── xT / action value metrikleri ─────────────────────────────────────────────
  getPlayerAdvancedValue: (id) => get(`/player/${id}/advanced-value`),

  // ── H2H — iki takım arasındaki WC geçmişi ────────────────────────────────────
  getH2H: (takim1, takim2, { normalize = true, minYil = 1930, maxYil = 2026 } = {}) => {
    const qs = new URLSearchParams({
      takim1,
      takim2,
      normalize,
      min_yil: minYil,
      max_yil: maxYil,
    });
    return get(`/h2h?${qs}`);
  },
};
