/**
 * Grup Aşaması Simülatörü — WC 2026 Grupları
 * Premium dark scoreboard design
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

const API = import.meta.env.VITE_API_URL ?? "";

const FLAGS = {
  Algeria:"🇩🇿",Argentina:"🇦🇷",Australia:"🇦🇺",Austria:"🇦🇹",
  Belgium:"🇧🇪","Bosnia and Herzegovina":"🇧🇦",Brazil:"🇧🇷",
  Canada:"🇨🇦","Cape Verde Islands":"🇨🇻",Colombia:"🇨🇴",
  "Congo DR":"🇨🇩",Croatia:"🇭🇷","Curaçao":"🇨🇼",
  "Czech Republic":"🇨🇿",Ecuador:"🇪🇨",Egypt:"🇪🇬",
  England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",Ghana:"🇬🇭",
  Haiti:"🇭🇹",Iran:"🇮🇷",Iraq:"🇮🇶","Ivory Coast":"🇨🇮",
  Japan:"🇯🇵",Jordan:"🇯🇴",Mexico:"🇲🇽",Morocco:"🇲🇦",
  Netherlands:"🇳🇱","New Zealand":"🇳🇿",Norway:"🇳🇴",
  Panama:"🇵🇦",Paraguay:"🇵🇾",Portugal:"🇵🇹",Qatar:"🇶🇦",
  "Saudi Arabia":"🇸🇦",Scotland:"🏴󠁧󠁢󠁳󠁣󠁴󠁿",Senegal:"🇸🇳",
  "South Africa":"🇿🇦","South Korea":"🇰🇷",Spain:"🇪🇸",
  Sweden:"🇸🇪",Switzerland:"🇨🇭",Tunisia:"🇹🇳",Turkey:"🇹🇷",
  "United States":"🇺🇸",Uruguay:"🇺🇾",Uzbekistan:"🇺🇿",
};
const fl = c => FLAGS[c] ?? "🏳️";

// ─── Card ─────────────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background:"linear-gradient(160deg,#162840 0%,#0f2035 100%)",
      border:"1px solid rgba(255,255,255,.07)",
      borderRadius:14,
      padding:"18px 20px",
      boxShadow:"0 4px 20px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.04)",
      marginBottom:12,
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ accent, children }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:7,
      marginBottom:16,
    }}>
      <div style={{
        width:2, height:12, borderRadius:99,
        background: accent || "#00d65c", flexShrink:0,
      }} />
      <span style={{
        fontSize:9, fontWeight:800, color:"#4d6380",
        letterSpacing:".12em", textTransform:"uppercase",
      }}>{children}</span>
    </div>
  );
}

// ─── Group selector button ────────────────────────────────────────
function GroupBtn({ letter, active, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding:"14px 0",
        borderRadius:10,
        border: `1px solid ${active ? "rgba(245,166,35,.4)" : "rgba(255,255,255,.07)"}`,
        background: active
          ? "linear-gradient(135deg,rgba(245,166,35,.15) 0%,rgba(245,166,35,.07) 100%)"
          : "rgba(255,255,255,.03)",
        color: active ? "#f5a623" : "#4d6380",
        fontSize:20, fontWeight:900, cursor:"pointer",
        transition:"all .18s",
        boxShadow: active ? "0 0 14px rgba(245,166,35,.15)" : "none",
      }}
      onMouseEnter={e => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,.06)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,.12)";
          e.currentTarget.style.color = "#7a9bb8";
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          e.currentTarget.style.background = "rgba(255,255,255,.03)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,.07)";
          e.currentTarget.style.color = "#4d6380";
        }
      }}
    >
      {letter}
    </button>
  );
}

// ─── Team standing row ────────────────────────────────────────────
function TeamRow({ rank, name, stats }) {
  const isTop2 = rank <= 2;
  const pct = stats.top2_pct;
  const barColor = isTop2 ? (rank === 1 ? "#f5a623" : "#94a3b8") : "#3d5a78";

  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:"32px 1fr 64px 72px 72px",
      gap:8, alignItems:"center",
      padding:"11px 14px",
      borderRadius:10,
      background: rank === 1
        ? "rgba(245,166,35,.06)"
        : rank === 2
          ? "rgba(148,163,184,.04)"
          : "transparent",
      border: `1px solid ${
        rank === 1 ? "rgba(245,166,35,.2)"
        : rank === 2 ? "rgba(148,163,184,.12)"
        : "rgba(255,255,255,.04)"
      }`,
      marginBottom:5,
      transition:"background .15s",
    }}>
      {/* Rank badge */}
      <div style={{
        width:26, height:26, borderRadius:7, flexShrink:0,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:11, fontWeight:900,
        background: rank === 1
          ? "linear-gradient(135deg,#f5a623,#e07b0c)"
          : rank === 2
            ? "rgba(148,163,184,.2)"
            : "rgba(255,255,255,.05)",
        color: rank === 1 ? "#0f1e2e" : rank === 2 ? "#94a3b8" : "#3d5a78",
        boxShadow: rank === 1 ? "0 2px 8px rgba(245,166,35,.3)" : "none",
      }}>{rank}</div>

      {/* Team */}
      <div style={{ display:"flex", alignItems:"center", gap:8, overflow:"hidden" }}>
        <span style={{ fontSize:20, flexShrink:0 }}>{fl(name)}</span>
        <div style={{ overflow:"hidden" }}>
          <div style={{
            fontSize:13, fontWeight:600, color:"#eef2f7",
            overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap",
          }}>{name}</div>
          {isTop2 && (
            <div style={{
              fontSize:9, fontWeight:800, color:"#00d65c",
              letterSpacing:".06em",
            }}>✓ GRUPTAN ÇIKIYOR</div>
          )}
        </div>
      </div>

      {/* Avg pts */}
      <div style={{ textAlign:"center" }}>
        <div style={{
          fontSize:17, fontWeight:900, color:"#f5a623",
          letterSpacing:"-0.5px",
        }}>{stats.avg_pts}</div>
        <div style={{ fontSize:9, color:"#3d5a78", letterSpacing:".04em" }}>ORT. PUAN</div>
      </div>

      {/* Top-2 pct + bar */}
      <div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
          <span style={{ fontSize:9, color:"#3d5a78", letterSpacing:".04em" }}>İLERLEME</span>
          <span style={{ fontSize:12, fontWeight:800, color: isTop2 ? "#00d65c" : "#4d6380" }}>
            {pct}%
          </span>
        </div>
        <div style={{
          height:3, borderRadius:99, background:"rgba(255,255,255,.06)", overflow:"hidden",
        }}>
          <div style={{
            width:`${pct}%`, height:"100%",
            background: isTop2 ? (rank === 1 ? "#f5a623" : "#00d65c") : "#3d5a78",
            borderRadius:99, transition:"width .7s cubic-bezier(.4,0,.2,1)",
          }} />
        </div>
      </div>

      {/* Winner pct */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:12, fontWeight:700, color:"#f5a623" }}>{stats.winner_pct}%</div>
        <div style={{ fontSize:9, color:"#3d5a78", letterSpacing:".04em" }}>1. OLMA</div>
      </div>
    </div>
  );
}

// ─── Match fixture card ───────────────────────────────────────────
function MatchCard({ match }) {
  return (
    <div style={{
      display:"grid", gridTemplateColumns:"1fr 56px 1fr",
      alignItems:"center", gap:6,
      padding:"10px 14px", borderRadius:8,
      background:"rgba(255,255,255,.02)",
      border:"1px solid rgba(255,255,255,.05)",
      marginBottom:5,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:7, justifyContent:"flex-end" }}>
        <span style={{ fontSize:12, color:"#eef2f7", fontWeight:500, textAlign:"right" }}>{match.ev}</span>
        <span style={{ fontSize:18, flexShrink:0 }}>{fl(match.ev)}</span>
      </div>

      <div style={{ textAlign:"center" }}>
        <div style={{
          background:"rgba(245,166,35,.12)", border:"1px solid rgba(245,166,35,.2)",
          borderRadius:6, padding:"3px 0",
          fontSize:10, fontWeight:800, color:"#f5a623", letterSpacing:".1em",
        }}>VS</div>
      </div>

      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
        <span style={{ fontSize:18, flexShrink:0 }}>{fl(match.dep)}</span>
        <span style={{ fontSize:12, color:"#eef2f7", fontWeight:500 }}>{match.dep}</span>
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────
export default function GroupSimPage() {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [result, setResult] = useState(null);

  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => fetch(`${API}/group-simulate/groups`).then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: (grup) =>
      fetch(`${API}/group-simulate`, {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify({ grup }),
      }).then(r => {
        if (!r.ok) throw new Error("Simülasyon hatası");
        return r.json();
      }),
    onSuccess: setResult,
  });

  function handleSelect(grup) {
    setSelectedGroup(grup);
    setResult(null);
    mutation.mutate(grup);
  }

  return (
    <div style={{ maxWidth:700, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{
          fontSize:"clamp(20px,4vw,28px)", fontWeight:900,
          color:"#eef2f7", letterSpacing:"-.5px", marginBottom:4,
        }}>
          🏆 Grup Aşaması Simülatörü
        </h2>
        <p style={{ fontSize:12, color:"#4d6380", letterSpacing:".02em" }}>
          WC 2026 · Her grup 50.000 turnuva simülasyonu · Poisson modeli
        </p>
      </div>

      {/* Group selector */}
      <Card style={{ marginBottom:20 }}>
        <CardTitle accent="#f5a623">Grup Seç</CardTitle>
        <div style={{
          display:"grid",
          gridTemplateColumns:"repeat(6,1fr)",
          gap:8,
        }}>
          {groups.length === 0
            ? Array.from({length:12}, (_,i) => String.fromCharCode(65+i)).map(g => (
                <div key={g} style={{
                  padding:"14px 0", borderRadius:10,
                  background:"rgba(255,255,255,.03)",
                  fontSize:20, fontWeight:900, textAlign:"center",
                  color:"transparent",
                }} className="hh-skeleton">{g}</div>
              ))
            : groups.map(g => (
                <GroupBtn
                  key={g}
                  letter={g}
                  active={selectedGroup === g}
                  onClick={() => handleSelect(g)}
                />
              ))
          }
        </div>
      </Card>

      {/* Loading */}
      {mutation.isPending && (
        <div style={{ textAlign:"center", padding:"56px 0" }}>
          <div style={{ fontSize:44, marginBottom:14,
            animation:"spin 1.2s linear infinite", display:"inline-block" }}>⚽</div>
          <div style={{ color:"#4d6380", fontSize:13, fontWeight:500 }}>
            Grup {selectedGroup} için 50.000 turnuva simüle ediliyor…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error */}
      {mutation.isError && (
        <Card style={{
          background:"rgba(255,71,87,.06)",
          border:"1px solid rgba(255,71,87,.2)",
          marginBottom:12,
        }}>
          <div style={{ fontSize:13, color:"#ff4757" }}>
            ⚠️ Simülasyon başarısız oldu. Grup veritabanında olmayabilir.
          </div>
        </Card>
      )}

      {/* Results */}
      {result && !mutation.isPending && (
        <div style={{ animation:"hh-fadein .35s ease" }}>

          {/* Standings table */}
          <Card>
            <CardTitle accent="#f5a623">
              Grup {result.grup} — Tahmini Sıralama
            </CardTitle>
            {/* Column headers */}
            <div style={{
              display:"grid",
              gridTemplateColumns:"32px 1fr 64px 72px 72px",
              gap:8, padding:"0 14px", marginBottom:8,
            }}>
              <div />
              <div style={{ fontSize:9, color:"#3d5a78", fontWeight:700, letterSpacing:".08em" }}>TAKIM</div>
              <div style={{ fontSize:9, color:"#3d5a78", fontWeight:700, textAlign:"center", letterSpacing:".08em" }}>PUAN</div>
              <div style={{ fontSize:9, color:"#3d5a78", fontWeight:700, letterSpacing:".08em" }}>İLERLEME</div>
              <div style={{ fontSize:9, color:"#3d5a78", fontWeight:700, textAlign:"center", letterSpacing:".08em" }}>1. OLMA</div>
            </div>
            {result.takim_siralama.map((name, idx) => (
              <TeamRow
                key={name}
                rank={idx + 1}
                name={name}
                stats={result.sonuclar[name]}
              />
            ))}
          </Card>

          {/* Advancement bars */}
          <Card>
            <CardTitle accent="#00d65c">Gruptan Çıkma İhtimali</CardTitle>
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
              {result.takim_siralama.map((name, idx) => {
                const s = result.sonuclar[name];
                const isTop2 = idx < 2;
                return (
                  <div key={name}>
                    <div style={{
                      display:"flex", alignItems:"center", justifyContent:"space-between",
                      marginBottom:6,
                    }}>
                      <div style={{ display:"flex", alignItems:"center", gap:7 }}>
                        <span style={{ fontSize:16 }}>{fl(name)}</span>
                        <span style={{ fontSize:12, fontWeight:600, color:"#eef2f7" }}>{name}</span>
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{
                          fontSize:9, fontWeight:800, color:"#3d5a78", letterSpacing:".06em",
                        }}>1. OLMA</span>
                        <span style={{
                          fontSize:11, fontWeight:700, color:"#f5a623",
                          minWidth:34, textAlign:"right",
                        }}>{s.winner_pct}%</span>
                      </div>
                    </div>
                    {/* Top-2 bar */}
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <div style={{
                        flex:1, height:5, borderRadius:99,
                        background:"rgba(255,255,255,.05)", overflow:"hidden",
                      }}>
                        <div style={{
                          width:`${s.top2_pct}%`, height:"100%",
                          background: isTop2 ? (idx === 0 ? "#f5a623" : "#00d65c") : "#3d5a78",
                          borderRadius:99,
                          transition:"width .7s cubic-bezier(.4,0,.2,1)",
                          boxShadow: isTop2 ? `0 0 6px ${idx === 0 ? "rgba(245,166,35,.4)" : "rgba(0,214,92,.3)"}` : "none",
                        }} />
                      </div>
                      <span style={{
                        fontSize:12, fontWeight:800, minWidth:38, textAlign:"right",
                        color: isTop2 ? (idx === 0 ? "#f5a623" : "#00d65c") : "#3d5a78",
                      }}>
                        {s.top2_pct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Fixtures */}
          <Card>
            <CardTitle accent="#38b2ff">
              Grup {result.grup} Maçları
            </CardTitle>
            {result.maclar.map((m, i) => (
              <MatchCard key={i} match={m} />
            ))}
          </Card>

          {/* Data warning */}
          {result.veri_eksik?.length > 0 && (
            <div style={{
              padding:"12px 16px", borderRadius:10,
              background:"rgba(245,166,35,.06)",
              border:"1px solid rgba(245,166,35,.18)",
              fontSize:11, color:"#f5a623",
            }}>
              ⚠️ Yeterli veri olmayan takımlar için varsayılan değerler kullanıldı:{" "}
              <span style={{ fontWeight:700 }}>{result.veri_eksik.join(", ")}</span>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!selectedGroup && !mutation.isPending && (
        <div style={{
          textAlign:"center", padding:"64px 20px",
          color:"#3d5a78",
        }}>
          <div style={{
            fontSize:60, marginBottom:16,
            animation:"hh-float 3s ease-in-out infinite", display:"inline-block",
          }}>🌍</div>
          <div style={{
            fontSize:17, fontWeight:700, marginBottom:8,
            color:"#4d6380",
          }}>Bir grup seç</div>
          <div style={{ fontSize:12, color:"#3d5a78", maxWidth:260, margin:"0 auto" }}>
            A'dan L'ye 12 grup — her biri 50.000 kez simüle edilerek
            ilerleme ihtimalleri hesaplanır
          </div>
        </div>
      )}
    </div>
  );
}
