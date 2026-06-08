import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.VITE_API_URL ?? "";

async function fetchPhoto(playerId) {
  const r = await fetch(`${BASE}/player/${playerId}/photo`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.url ?? null;
}

export function usePlayerPhoto(playerId) {
  const { data } = useQuery({
    queryKey: ["player-photo", playerId],
    queryFn: () => fetchPhoto(playerId),
    enabled: !!playerId,
    staleTime: 30 * 60 * 1000,  // fotoğraflar 30 dk cache'de kalır
  });
  return data ?? null;
}
