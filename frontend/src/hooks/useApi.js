/**
 * React Query hook'ları — her endpoint için kullanıma hazır cache'li sorgular.
 */
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function get(path) {
  const r = await fetch(`${BASE}${path}`);
  if (!r.ok) return null;
  return r.json();
}

// ── Oyuncu profili ────────────────────────────────────────────────────────────
export function usePlayer(playerId) {
  return useQuery({
    queryKey: ["player", playerId],
    queryFn: () => get(`/player/${playerId}`),
    enabled: !!playerId,
  });
}

// ── Oyuncu turnuvaları ────────────────────────────────────────────────────────
export function usePlayerCompetitions(playerId) {
  return useQuery({
    queryKey: ["player-competitions", playerId],
    queryFn: () => get(`/player/${playerId}/competitions`).then(r => r ?? []),
    enabled: !!playerId,
  });
}

// ── Oyuncu arketipi ───────────────────────────────────────────────────────────
export function usePlayerArchetype(playerId) {
  return useQuery({
    queryKey: ["player-archetype", playerId],
    queryFn: () => get(`/player/${playerId}/archetype`),
    enabled: !!playerId,
  });
}

// ── Piyasa değeri ─────────────────────────────────────────────────────────────
export function usePlayerMarket(playerId) {
  return useQuery({
    queryKey: ["player-market", playerId],
    queryFn: () => get(`/player/${playerId}/market`),
    enabled: !!playerId,
  });
}

// ── xG Trendi ─────────────────────────────────────────────────────────────────
export function usePlayerXgTrend(playerId) {
  return useQuery({
    queryKey: ["player-xg-trend", playerId],
    queryFn: () => get(`/player/${playerId}/xg-trend`).then(r => (Array.isArray(r) ? r : [])),
    enabled: !!playerId,
  });
}

// ── Takımlar ──────────────────────────────────────────────────────────────────
export function useTeams() {
  return useQuery({
    queryKey: ["teams"],
    queryFn: () => get("/teams").then(r => r ?? []),
    staleTime: 15 * 60 * 1000,
  });
}

// ── Takım oyuncuları ──────────────────────────────────────────────────────────
export function useTeamPlayers(ulke) {
  return useQuery({
    queryKey: ["team-players", ulke],
    queryFn: () => get(`/teams/${encodeURIComponent(ulke)}/players`).then(r => r ?? []),
    enabled: !!ulke,
  });
}

// ── Takım özeti ───────────────────────────────────────────────────────────────
export function useTeamSummary(ulke) {
  return useQuery({
    queryKey: ["team-summary", ulke],
    queryFn: () => get(`/teams/${encodeURIComponent(ulke)}/summary`),
    enabled: !!ulke,
  });
}

// ── İstatistik liderleri ──────────────────────────────────────────────────────
export function useStatsLeaders() {
  return useQuery({
    queryKey: ["stats-leaders"],
    queryFn: () => get("/stats/leaders").then(r => r ?? []),
    staleTime: 10 * 60 * 1000,
  });
}

// ── Benzer oyuncular ──────────────────────────────────────────────────────────
export function useSimilarPlayers(playerId, opts = {}) {
  const { topN = 5, samePosition = false, minMinutes = 90 } = opts;
  return useQuery({
    queryKey: ["similar-players", playerId, topN, samePosition, minMinutes],
    queryFn: () =>
      get(`/player/${playerId}/similar?top_n=${topN}&same_position_only=${samePosition}&min_minutes=${minMinutes}`)
        .then(r => r ?? []),
    enabled: !!playerId,
  });
}
