/**
 * SimulatePage — Premium Match Simulator
 * SofaScore-inspired dark scoreboard design
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
const fl = c => FLAGS[c] ?? "🏳️";

async function runSimulation(takim_a, takim_b) {
  const r = await fetch(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ takim_a, takim_b }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ─── Team Select ─────────────────────────────────────────────────
function TeamSelect({ value, onChange, label }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <div style={{
        fontSize:9, fontWeight:800, color:"#4d6380",
        letterSpacing:".12em", textTransform:"uppercase",
      }}>{label}</div>
      <div style={{ position:"relative" }}>
        <span style={{
          position:"absolute", left:14, top:"50%", transform:"translateY(-50%)",
          fontSize:22, lineHeight:1, pointerEvents:"none", zIndex:1,
        }}>{fl(value)}</span>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{
            appearance:"none", WebkitAppearance:"none",
            background:"rgba(255,255,255,.07)",
            border:"1px solid rgba(255,255,255,.1)",
            borderRadius:10,
            color:"#eef2f7",
            fontSize:13, fontWeight:600,
            padding:"11px 40px 11px 46px",
            cursor:"pointer",
            outline:"none",
            minWidth:200,
            transition:"border-color .15s, box-shadow .15s",
          }}
          onFocus={e => {
            e.target.style.borderColor = "#f5a623";
            e.target.style.boxShadow = "0 0 0 3px rgba(245,166,35,.15)";
          }}
          onBlur={e => {
            e.target.style.borderColor = "rgba(255,255,255,.1)";
            e.target.style.boxShadow = "none";
          }}
        >
          {WC_TEAMS.map(t => <option key={t} value={t} style={{ background:"#0f2035" }}>{t}</option>)}
        </select>
        <span style={{
          position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
          color:"#4d6380", pointerEvents:"none", fontSize:10,
        }}>▼</span>
      </div>
    </div>
  );
}

// ─── Prob Pill ───────────────────────────────────────────────────
function ProbPill({ label, pct, color, flag: flagEmoji }) {
  const isHighest = pct > 45;
  return (
    <div style={{
      flex:1, textAlign:"center",
      padding:"16px 10px",
      borderRadius:12,
      background: isHighest ? `${color}12` : "rgba(255,255,255,.03)",
      border: `1px solid ${isHighest ? color + "30" : "rgba(255,255,255,.06)"}`,
      transition:"all .3s",
    }}>
      {flagEmoji && <div style={{ fontSize:24, marginBottom:6 }}>{flagEmoji}</div>}
      <div style={{
        fontSize:"clamp(24px,5vw,36px)", fontWeight:900, color,
        lineHeight:1, letterSpacing:"-1px",
        fontVariantNumeric:"tabular-nums",
      }}>
        {pct}%
      </div>
      <div style={{
        height:3, borderRadius:99, background:"rgba(255,255,255,.06)",
        margin:"10px 0 8px", overflow:"hidden",
      }}>
        <div style={{
          width:`${pct}%`, height:"100%", background:color,
          borderRadius:99, transition:"width .8s cubic-bezier(.4,0,.2,1)",
          boxShadow:`0 0 8px ${color}80`,
        }} />
      </div>
      <div style={{ fontSize:11, color:"#4d6380", fontWeight:700, letterSpacing:".04em" }}>{label}</div>
    </div>
  );
}

// ─── Goal event ──────────────────────────────────────────────────
function GoalEvent({ event, isLeft }) {
  return (
    <div style={{
      display:"flex", alignItems:"center",
      justifyContent: isLeft ? "flex-start" : "flex-end",
      gap:8, padding:"6px 0",
      borderBottom:"1px solid rgba(255,255,255,.04)",
      animation:"hh-fadein .3s ease both",
    }}>
      {isLeft ? (
        <>
          <div style={{
            fontSize:9, fontWeight:800, color:"#0f2035",
            background:"rgba(245,166,35,.8)", borderRadius:4,
            padding:"2px 6px", letterSpacing:".04em",
          }}>{event.dakika}'</div>
          <span style={{ fontSize:14 }}>⚽</span>
          <span style={{ fontSize:12, fontWeight:600, color:"#eef2f7" }}>{event.oyuncu}</span>
        </>
      ) : (
        <>
          <span style={{ fontSize:12, fontWeight:600, color:"#eef2f7" }}>{event.oyuncu}</span>
          <span style={{ fontSize:14 }}>⚽</span>
          <div style={{
            fontSize:9, fontWeight:800, color:"#0f2035",
            background:"rgba(56,178,255,.8)", borderRadius:4,
            padding:"2px 6px", letterSpacing:".04em",
          }}>{event.dakika}'</div>
        </>
      )}
    </div>
  );
}

// ─── Player row ──────────────────────────────────────────────────
function PlayerRow({ player, index, color }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"8px 12px",
      borderRadius:8,
      background: index === 0 ? `${color}0e` : "transparent",
      border: `1px solid ${index === 0 ? color + "20" : "transparent"}`,
      marginBottom:4,
      transition:"all .15s",
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <div style={{
          width:22, height:22, borderRadius:6,
          background: index === 0 ? color : "rgba(255,255,255,.07)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:10, fontWeight:800,
          color: index === 0 ? "#0f1e2e" : "#4d6380",
        }}>{index + 1}</div>
        <div>
          <div style={{ fontSize:12, fontWeight:600, color:"#eef2f7" }}>{player.isim}</div>
          {player.mevki && (
            <div style={{ fontSize:9, color:"#4d6380", letterSpacing:".04em" }}>{player.mevki}</div>
          )}
        </div>
      </div>
      <div style={{ display:"flex", gap:5 }}>
        <span style={{
          background:`${color}18`, border:`1px solid ${color}30`,
          borderRadius:5, color, fontSize:9,
          fontWeight:800, padding:"2px 7px", letterSpacing:".04em",
        }}>
          xG {player.xg90}
        </span>
        {player.gol > 0 && (
          <span style={{
            background:"rgba(0,214,92,.1)", border:"1px solid rgba(0,214,92,.25)",
            borderRadius:5, color:"#00d65c", fontSize:9,
            fontWeight:800, padding:"2px 7px",
          }}>
            {player.gol}⚽
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Card wrapper ─────────────────────────────────────────────────
function Card({ children, style = {} }) {
  return (
    <div style={{
      background:"linear-gradient(160deg, #162840 0%, #0f2035 100%)",
      border:"1px solid rgba(255,255,255,.07)",
      borderRadius:14,
      padding:"18px 20px",
      boxShadow:"0 4px 20px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.04)",
      ...style,
    }}>
      {children}
    </div>
  );
}

function CardTitle({ children }) {
  return (
    <div style={{
      fontSize:9, fontWeight:800, color:"#4d6380",
      letterSpacing:".12em", textTransform:"uppercase",
      marginBottom:14,
      display:"flex", alignItems:"center", gap:6,
    }}>
      <div style={{ width:2, height:12, borderRadius:99, background:"#00d65c", flexShrink:0 }} />
      {children}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────
export default function SimulatePage() {
  const [teamA, setTeamA] = useState("Turkey");
  const [teamB, setTeamB] = useState("France");

  const mutation = useMutation({
    mutationFn: () => runSimulation(teamA, teamB),
  });

  const res = mutation.data;

  return (
    <div style={{ maxWidth:800, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{
          fontSize:"clamp(20px,4vw,28px)", fontWeight:900,
          color:"#eef2f7", letterSpacing:"-.5px", marginBottom:4,
        }}>
          🎮 Maç Simülatörü
        </h2>
        <p style={{ fontSize:12, color:"#4d6380", letterSpacing:".02em" }}>
          Gerçek xG & savunma verileri · Poisson modeli · 1.000.000 simülasyon
        </p>
      </div>

      {/* Team selection card */}
      <Card style={{ marginBottom:16 }}>
        <div style={{
          display:"flex", alignItems:"flex-end", gap:16, flexWrap:"wrap",
        }}>
          <TeamSelect value={teamA} onChange={setTeamA} label="Ev Sahibi" />

          <div style={{
            display:"flex", flexDirection:"column", alignItems:"center", gap:2,
            marginBottom:4, flex:"0 0 auto",
          }}>
            <div style={{ fontSize:10, fontWeight:800, color:"#3d5a78", letterSpacing:".1em" }}>VS</div>
          </div>

          <TeamSelect value={teamB} onChange={setTeamB} label="Deplasman" />

          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || teamA === teamB}
            style={{
              marginBottom:0,
              background: mutation.isPending
                ? "rgba(255,255,255,.06)"
                : "linear-gradient(135deg, #f5a623 0%, #e07b0c 100%)",
              border: mutation.isPending ? "1px solid rgba(255,255,255,.1)" : "none",
              borderRadius:10, color: mutation.isPending ? "#4d6380" : "#0f1e2e",
              fontSize:13, fontWeight:800, padding:"11px 22px",
              cursor: mutation.isPending || teamA === teamB ? "not-allowed" : "pointer",
              boxShadow: mutation.isPending ? "none" : "0 4px 16px rgba(245,166,35,.3)",
              transition:"all .2s", letterSpacing:".02em",
              whiteSpace:"nowrap",
              opacity: teamA === teamB ? .4 : 1,
            }}
          >
            {mutation.isPending ? "⏳ Simüle ediliyor…" : "⚽ Simüle Et"}
          </button>
        </div>
        {teamA === teamB && (
          <div style={{ marginTop:10, fontSize:11, color:"#f5a623" }}>
            ⚠️ Aynı takımı seçemezsin
          </div>
        )}
      </Card>

      {/* Error */}
      {mutation.isError && (
        <Card style={{
          marginBottom:16,
          background:"rgba(255,71,87,.08)",
          border:"1px solid rgba(255,71,87,.2)",
        }}>
          <div style={{ fontSize:13, color:"#ff4757" }}>
            ⚠️ {mutation.error?.message || "Simülasyon hatası. Bu takımlar için yeterli veri olmayabilir."}
          </div>
        </Card>
      )}

      {/* Results */}
      {res && (
        <div style={{ display:"flex", flexDirection:"column", gap:12, animation:"hh-fadein .4s ease" }}>

          {/* Scoreboard */}
          <div style={{
            background:"linear-gradient(160deg, #0b1f35 0%, #071525 100%)",
            border:"1px solid rgba(255,255,255,.08)",
            borderRadius:16,
            overflow:"hidden",
            boxShadow:"0 8px 40px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.05)",
          }}>
            {/* Header */}
            <div style={{
              background:"rgba(255,255,255,.03)",
              borderBottom:"1px solid rgba(255,255,255,.06)",
              padding:"8px 16px",
              display:"flex", alignItems:"center", justifyContent:"center",
              gap:8,
            }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:"#f5a623",
                            animation:"hh-pulse-live 1.4s ease-in-out infinite" }} />
              <span style={{
                fontSize:9, fontWeight:800, color:"#4d6380",
                letterSpacing:".14em", textTransform:"uppercase",
              }}>
                Simülasyon Sonucu · 1.000.000 Maç
              </span>
            </div>

            {/* Scoreline */}
            <div style={{
              display:"grid", gridTemplateColumns:"1fr auto 1fr",
              alignItems:"center", gap:8,
              padding:"24px 20px",
            }}>
              {/* Team A */}
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:44, lineHeight:1, marginBottom:8 }}>{fl(teamA)}</div>
                <div style={{ fontSize:12, fontWeight:700, color:"#eef2f7", marginBottom:3 }}>{teamA}</div>
                <div style={{
                  display:"inline-flex", alignItems:"center", gap:4,
                  background:"rgba(245,166,35,.1)", border:"1px solid rgba(245,166,35,.2)",
                  borderRadius:6, padding:"2px 8px",
                  fontSize:9, fontWeight:800, color:"#f5a623", letterSpacing:".06em",
                }}>
                  xG {res.xg_a}
                </div>
              </div>

              {/* Score */}
              <div style={{ textAlign:"center", padding:"0 8px" }}>
                <div style={{
                  fontSize:"clamp(44px,8vw,72px)", fontWeight:900,
                  color:"#eef2f7", letterSpacing:"-4px", lineHeight:1,
                  fontVariantNumeric:"tabular-nums",
                  textShadow:"0 0 30px rgba(255,255,255,.15)",
                }}>
                  {res.skor_a}
                  <span style={{ color:"#3d5a78", margin:"0 4px" }}>—</span>
                  {res.skor_b}
                </div>
                <div style={{ fontSize:10, color:"#3d5a78", marginTop:6, fontWeight:600, letterSpacing:".06em" }}>
                  EN OLASI SKOR
                </div>
              </div>

              {/* Team B */}
              <div style={{ textAlign:"center" }}>
                <div style={{ fontSize:44, lineHeight:1, marginBottom:8 }}>{fl(teamB)}</div>
                <div style={{ fontSize:12, fontWeight:700, color:"#eef2f7", marginBottom:3 }}>{teamB}</div>
                <div style={{
                  display:"inline-flex", alignItems:"center", gap:4,
                  background:"rgba(56,178,255,.1)", border:"1px solid rgba(56,178,255,.2)",
                  borderRadius:6, padding:"2px 8px",
                  fontSize:9, fontWeight:800, color:"#38b2ff", letterSpacing:".06em",
                }}>
                  xG {res.xg_b}
                </div>
              </div>
            </div>
          </div>

          {/* Win probabilities */}
          <Card>
            <CardTitle>Kazanma Olasılıkları</CardTitle>
            <div style={{ display:"flex", gap:8 }}>
              <ProbPill
                label={teamA.split(" ")[0]}
                pct={res.olasilik_a}
                color="#f5a623"
                flag={fl(teamA)}
              />
              <ProbPill
                label="Beraberlik"
                pct={res.beraberlik}
                color="#7a9bb8"
              />
              <ProbPill
                label={teamB.split(" ")[0]}
                pct={res.olasilik_b}
                color="#38b2ff"
                flag={fl(teamB)}
              />
            </div>
          </Card>

          {/* Top scores + Timeline */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Card>
              <CardTitle>⚽ Gol Olayları</CardTitle>
              {(!res.olaylar?.length) ? (
                <div style={{ textAlign:"center", padding:"20px 0", color:"#3d5a78", fontSize:12 }}>
                  Bu simülasyonda gol yok
                </div>
              ) : (
                <div>
                  {res.olaylar.map((e, i) => (
                    <GoalEvent key={i} event={e} isLeft={e.takim === "a"} />
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardTitle>🎯 En Olası Skorlar</CardTitle>
              {res.top_skorlar.map((s, i) => (
                <div key={i} style={{
                  display:"flex", alignItems:"center", justifyContent:"space-between",
                  padding:"9px 0",
                  borderBottom: i < res.top_skorlar.length - 1
                    ? "1px solid rgba(255,255,255,.05)" : "none",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{
                      width:22, height:22, borderRadius:6,
                      background: i === 0 ? "rgba(245,166,35,.15)" : "rgba(255,255,255,.05)",
                      border: `1px solid ${i === 0 ? "rgba(245,166,35,.3)" : "rgba(255,255,255,.08)"}`,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:9, fontWeight:800,
                      color: i === 0 ? "#f5a623" : "#4d6380",
                    }}>{i+1}</div>
                    <span style={{
                      fontSize:16, fontWeight:900, color:"#eef2f7",
                      letterSpacing:"-0.5px", fontVariantNumeric:"tabular-nums",
                    }}>{s.skor}</span>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{
                      width:72, height:4, borderRadius:99,
                      background:"rgba(255,255,255,.06)", overflow:"hidden",
                    }}>
                      <div style={{
                        width:`${s.pct * 5}%`, height:"100%",
                        background: i === 0 ? "#f5a623" : "#3d5a78",
                        borderRadius:99,
                      }} />
                    </div>
                    <span style={{
                      fontSize:11, fontWeight:700,
                      color: i === 0 ? "#f5a623" : "#4d6380",
                    }}>%{s.pct}</span>
                  </div>
                </div>
              ))}
            </Card>
          </div>

          {/* Key players */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <Card>
              <CardTitle>{fl(teamA)} {teamA} — Kilit Oyuncular</CardTitle>
              {res.kilit_oyuncular_a.map((p, i) => (
                <PlayerRow key={i} player={p} index={i} color="#f5a623" />
              ))}
            </Card>
            <Card>
              <CardTitle>{fl(teamB)} {teamB} — Kilit Oyuncular</CardTitle>
              {res.kilit_oyuncular_b.map((p, i) => (
                <PlayerRow key={i} player={p} index={i} color="#38b2ff" />
              ))}
            </Card>
          </div>

          {/* GK row */}
          <Card style={{ padding:"12px 16px" }}>
            <div style={{ display:"flex", gap:24, flexWrap:"wrap", fontSize:11, color:"#4d6380" }}>
              <span>🧤 <span style={{ color:"#7a9bb8" }}>{teamA}:</span>{" "}
                <strong style={{ color:"#eef2f7" }}>{res.gk_a}</strong>
              </span>
              <span>🧤 <span style={{ color:"#7a9bb8" }}>{teamB}:</span>{" "}
                <strong style={{ color:"#eef2f7" }}>{res.gk_b}</strong>
              </span>
              <span style={{ marginLeft:"auto", fontStyle:"italic", color:"#3d5a78" }}>
                * Sonuçlar her simülasyonda değişebilir
              </span>
            </div>
          </Card>

        </div>
      )}
    </div>
  );
}
