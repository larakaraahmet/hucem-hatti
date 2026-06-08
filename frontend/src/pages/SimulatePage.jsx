/**
 * SimulatePage — Gerçek xG verileriyle Poisson maç simülatörü
 */
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";

const BASE = import.meta.env.VITE_API_URL ?? "";

const WC_TEAMS = [
  "Argentina","Australia","Austria","Belgium","Bosnia and Herzegovina",
  "Brazil","Canada","Cape Verde Islands","Colombia","Congo DR","Croatia",
  "Curaçao","Czech Republic","Ecuador","Egypt","England","France","Germany",
  "Ghana","Haiti","Iran","Iraq","Ivory Coast","Japan","Jordan","Mexico",
  "Morocco","Netherlands","New Zealand","Norway","Panama","Paraguay",
  "Portugal","Qatar","Saudi Arabia","Scotland","Senegal","South Africa",
  "South Korea","Spain","Sweden","Switzerland","Tunisia","Turkey",
  "United States","Uruguay","Uzbekistan",
].sort();

const FLAGS = {
  Argentina:"🇦🇷",Australia:"🇦🇺",Austria:"🇦🇹",Belgium:"🇧🇪",
  "Bosnia and Herzegovina":"🇧🇦",Brazil:"🇧🇷",Canada:"🇨🇦",
  "Cape Verde Islands":"🇨🇻",Colombia:"🇨🇴","Congo DR":"🇨🇩",
  Croatia:"🇭🇷","Curaçao":"🇨🇼","Czech Republic":"🇨🇿",Ecuador:"🇪🇨",
  Egypt:"🇪🇬",England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",Ghana:"🇬🇭",
  Haiti:"🇭🇹",Iran:"🇮🇷",Iraq:"🇮🇶","Ivory Coast":"🇨🇮",Japan:"🇯🇵",
  Jordan:"🇯🇴",Mexico:"🇲🇽",Morocco:"🇲🇦",Netherlands:"🇳🇱",
  "New Zealand":"🇳🇿",Norway:"🇳🇴",Panama:"🇵🇦",Paraguay:"🇵🇾",
  Portugal:"🇵🇹",Qatar:"🇶🇦","Saudi Arabia":"🇸🇦",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  Senegal:"🇸🇳","South Africa":"🇿🇦","South Korea":"🇰🇷",Spain:"🇪🇸",
  Sweden:"🇸🇪",Switzerland:"🇨🇭",Tunisia:"🇹🇳",Turkey:"🇹🇷",
  "United States":"🇺🇸",Uruguay:"🇺🇾",Uzbekistan:"🇺🇿",
};
const flag = c => FLAGS[c] ?? "🏳️";

async function runSimulation(takim_a, takim_b) {
  const r = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takim_a, takim_b }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

function ProbBar({ label, pct, color }) {
  return (
    <div style={{ textAlign: "center", flex: 1 }}>
      <div style={{ fontSize: 22, fontWeight: 900, color }}>{pct}%</div>
      <div style={{
        height: 8, borderRadius: 4, background: "#e2e8f0", margin: "6px 0",
        overflow: "hidden",
      }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color,
                      borderRadius: 4, transition: "width 1s ease" }} />
      </div>
      <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>{label}</div>
    </div>
  );
}

function Timeline({ events, takim_a, takim_b }) {
  if (!events?.length) return (
    <div style={{ textAlign: "center", color: "#94a3b8", fontSize: 13, padding: "16px 0" }}>
      Gol yok
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {events.map((e, i) => {
        const isA = e.takim === "a";
        return (
          <div key={i} style={{
            display: "flex", alignItems: "center", gap: 12,
            justifyContent: isA ? "flex-start" : "flex-end",
            animation: `hh-fadein .3s ease ${i * 0.12}s both`,
          }}>
            {isA && (
              <>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b",
                               background: "#f1f5f9", borderRadius: 6, padding: "2px 7px" }}>
                  {e.dakika}'
                </span>
                <span style={{ fontSize: 16 }}>⚽</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  {e.oyuncu}
                </span>
                <span style={{ fontSize: 11, color: "#64748b" }}>{flag(takim_a)}</span>
              </>
            )}
            {!isA && (
              <>
                <span style={{ fontSize: 11, color: "#64748b" }}>{flag(takim_b)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>
                  {e.oyuncu}
                </span>
                <span style={{ fontSize: 16 }}>⚽</span>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#64748b",
                               background: "#f1f5f9", borderRadius: 6, padding: "2px 7px" }}>
                  {e.dakika}'
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function KeyPlayers({ players, title }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                    letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 8 }}>
        {title}
      </div>
      {players.map((p, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "5px 0", borderBottom: "1px solid #f1f5f9", fontSize: 12,
        }}>
          <span style={{ fontWeight: 600, color: "#0f172a" }}>{p.isim}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <span style={{ background: "#fef3c7", border: "1px solid #fde68a",
                           borderRadius: 4, color: "#d97706", fontSize: 10,
                           fontWeight: 700, padding: "1px 6px" }}>
              xG/90: {p.xg90}
            </span>
            {p.gol > 0 && (
              <span style={{ background: "#dcfce7", border: "1px solid #86efac",
                             borderRadius: 4, color: "#16a34a", fontSize: 10,
                             fontWeight: 700, padding: "1px 6px" }}>
                {p.gol} gol
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function SimulatePage() {
  const [teamA, setTeamA] = useState("Turkey");
  const [teamB, setTeamB] = useState("France");

  const mutation = useMutation({
    mutationFn: () => runSimulation(teamA, teamB),
  });

  const res = mutation.data;

  const selectStyle = {
    padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0",
    fontSize: 14, fontWeight: 600, background: "#ffffff", color: "#0f172a",
    cursor: "pointer", appearance: "none", WebkitAppearance: "none",
    backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2364748b' d='M6 8L1 3h10z'/%3E%3C/svg%3E\")",
    backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center",
    paddingRight: 36, minWidth: 180,
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4, color: "var(--text)" }}>
        🎮 Maç Simülatörü
      </h2>
      <p style={{ fontSize: 13, color: "var(--sub)", marginBottom: 24 }}>
        Gerçek xG & savunma verileriyle 10.000 maç simülasyonu — Poisson modeli
      </p>

      {/* Takım seçimi */}
      <div style={{
        background: "var(--surface)", border: "1px solid var(--border)",
        borderRadius: 16, padding: "24px", marginBottom: 20,
        display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                          letterSpacing: ".1em", textTransform: "uppercase" }}>
            Ev Sahibi
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 20 }}>
              {flag(teamA)}
            </span>
            <select value={teamA} onChange={e => setTeamA(e.target.value)}
              style={{ ...selectStyle, paddingLeft: 42 }}>
              {WC_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div style={{ fontSize: 22, fontWeight: 900, color: "#94a3b8", marginTop: 20 }}>vs</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                          letterSpacing: ".1em", textTransform: "uppercase" }}>
            Deplasman
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 20 }}>
              {flag(teamB)}
            </span>
            <select value={teamB} onChange={e => setTeamB(e.target.value)}
              style={{ ...selectStyle, paddingLeft: 42 }}>
              {WC_TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", gap: 8 }}>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || teamA === teamB}
            style={{
              background: mutation.isPending ? "#94a3b8" : "linear-gradient(135deg, #f59e0b, #d97706)",
              border: "none", borderRadius: 10, color: "#ffffff",
              fontSize: 14, fontWeight: 800, padding: "11px 24px",
              cursor: mutation.isPending ? "not-allowed" : "pointer",
              boxShadow: "0 4px 14px rgba(245,158,11,.35)",
              transition: "all .2s",
            }}>
            {mutation.isPending ? "⏳ Simüle ediliyor…" : "⚽ Simüle Et"}
          </button>
          {res && (
            <button onClick={() => { const a=teamA; setTeamA(teamB); setTeamB(a); }}
              style={{
                background: "transparent", border: "1.5px solid #e2e8f0",
                borderRadius: 10, color: "#64748b", fontSize: 14,
                fontWeight: 700, padding: "11px 16px", cursor: "pointer",
              }} title="Takımları ters çevir">
              ⇄
            </button>
          )}
        </div>
      </div>

      {/* Hata */}
      {mutation.isError && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca",
                      borderRadius: 12, padding: 16, color: "#dc2626", fontSize: 13, marginBottom: 16 }}>
          ⚠️ {mutation.error?.message || "Simülasyon hatası. Bu takımlar için yeterli veri olmayabilir."}
        </div>
      )}

      {/* Sonuçlar */}
      {res && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, animation: "hh-fadein .4s ease" }}>

          {/* Skor tablosu */}
          <div style={{
            background: "linear-gradient(135deg, #0c2040, #162d50)",
            borderRadius: 16, padding: "28px 24px", textAlign: "center",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3,
                          background: "linear-gradient(90deg, #f59e0b, #38bdf8)" }} />

            <div style={{ fontSize: 11, fontWeight: 800, color: "#94a3b8",
                          letterSpacing: ".15em", textTransform: "uppercase", marginBottom: 16 }}>
              Simülasyon Sonucu (10.000 maç)
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40 }}>{flag(teamA)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginTop: 4 }}>{teamA}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>xG: {res.xg_a}</div>
              </div>

              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 56, fontWeight: 900, color: "#ffffff",
                              letterSpacing: -2, fontVariantNumeric: "tabular-nums" }}>
                  {res.skor_a} — {res.skor_b}
                </div>
                <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>En olası skor</div>
              </div>

              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 40 }}>{flag(teamB)}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#94a3b8", marginTop: 4 }}>{teamB}</div>
                <div style={{ fontSize: 11, color: "#64748b" }}>xG: {res.xg_b}</div>
              </div>
            </div>
          </div>

          {/* Olasılık barları */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 14, padding: "20px 24px",
          }}>
            <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                          letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 16 }}>
              Kazanma Olasılıkları
            </div>
            <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
              <ProbBar label={`${flag(teamA)} ${teamA}`} pct={res.olasilik_a} color="#f59e0b" />
              <ProbBar label="Beraberlik" pct={res.beraberlik} color="#94a3b8" />
              <ProbBar label={`${flag(teamB)} ${teamB}`} pct={res.olasilik_b} color="#38bdf8" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Gol olayları */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "20px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                            letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                Gol Olayları
              </div>
              <Timeline events={res.olaylar} takim_a={teamA} takim_b={teamB} />
            </div>

            {/* En olası skorlar */}
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "20px",
            }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: "#94a3b8",
                            letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 14 }}>
                En Olası Skorlar
              </div>
              {res.top_skorlar.map((s, i) => (
                <div key={i} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 0", borderBottom: "1px solid var(--border)",
                  fontSize: 13,
                }}>
                  <span style={{ fontWeight: 800, color: "var(--text)", fontSize: 16 }}>{s.skor}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 80, height: 6, borderRadius: 3, background: "var(--border)", overflow: "hidden" }}>
                      <div style={{ width: `${s.pct * 5}%`, height: "100%",
                                    background: "#f59e0b", borderRadius: 3 }} />
                    </div>
                    <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>%{s.pct}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Kilit oyuncular */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "20px",
            }}>
              <KeyPlayers players={res.kilit_oyuncular_a}
                title={`${flag(teamA)} ${teamA} — Kilit Oyuncular`} />
            </div>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 14, padding: "20px",
            }}>
              <KeyPlayers players={res.kilit_oyuncular_b}
                title={`${flag(teamB)} ${teamB} — Kilit Oyuncular`} />
            </div>
          </div>

          {/* Kaleciler */}
          <div style={{
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 12, padding: "14px 20px",
            display: "flex", gap: 24, flexWrap: "wrap", fontSize: 12, color: "#64748b",
          }}>
            <span>🧤 {teamA}: <strong style={{ color: "var(--text)" }}>{res.gk_a}</strong></span>
            <span>🧤 {teamB}: <strong style={{ color: "var(--text)" }}>{res.gk_b}</strong></span>
            <span style={{ marginLeft: "auto", fontStyle: "italic" }}>
              * Sonuçlar her simülasyonda değişebilir
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
