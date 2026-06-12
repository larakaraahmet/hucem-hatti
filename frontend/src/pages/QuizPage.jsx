/**
 * Kim Bu Oyuncu? — İstatistiklere bakarak oyuncuyu tahmin et
 * Premium dark design
 */
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";

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
  Georgia:"🇬🇪",Italy:"🇮🇹",
};
const fl = c => FLAGS[c] ?? "🏳️";

const STAT_LABELS = [
  { key:"xg90",    label:"xG/90",        icon:"⚽", desc:"Beklenen Gol" },
  { key:"xa90",    label:"xA/90",        icon:"🎯", desc:"Beklenen Asist" },
  { key:"gol90",   label:"Gol/90",       icon:"🥅", desc:"Gerçek Gol" },
  { key:"asist90", label:"Asist/90",     icon:"👟", desc:"Gerçek Asist" },
  { key:"sut90",   label:"Şut/90",       icon:"💥", desc:"Toplam Şut" },
  { key:"prog90",  label:"İlerleme/90",  icon:"🚀", desc:"Progressive Pass" },
];

const STAT_MAXES = { xg90:1.2, xa90:0.5, gol90:0.8, asist90:0.4, sut90:5.0, prog90:3.0 };

// ─── Stat bar ──────────────────────────────────────────────────────
function StatBar({ value, max }) {
  const pct = Math.min(value / max * 100, 100);
  const color = pct > 70 ? "#f5a623" : pct > 40 ? "#00d65c" : "#3d5a78";
  return (
    <div style={{
      height:4, borderRadius:99,
      background:"rgba(255,255,255,.06)", overflow:"hidden",
    }}>
      <div style={{
        width:`${pct}%`, height:"100%", background:color, borderRadius:99,
        boxShadow:`0 0 4px ${color}60`,
        transition:"width .5s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

// ─── Stats card ────────────────────────────────────────────────────
function StatsCard({ stats, mevki, milliyet, revealed }) {
  return (
    <div style={{
      background:"linear-gradient(160deg,#162840 0%,#0f2035 100%)",
      border:"1px solid rgba(255,255,255,.07)",
      borderRadius:14, padding:20,
      boxShadow:"0 4px 20px rgba(0,0,0,.3),inset 0 1px 0 rgba(255,255,255,.04)",
    }}>
      {/* Profile header */}
      <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:20 }}>
        <div style={{
          width:58, height:58, borderRadius:14,
          background: revealed ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.3)",
          border:`2px solid ${revealed ? "rgba(245,166,35,.3)" : "rgba(255,255,255,.1)"}`,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:30,
          transition:"all .3s",
        }}>
          {revealed ? fl(milliyet) : "🕵️"}
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:9, color:"#3d5a78", fontWeight:800, letterSpacing:".1em", marginBottom:4 }}>
            MEVKİ
          </div>
          <div style={{ fontSize:16, fontWeight:800, color:"#f5a623", letterSpacing:".02em" }}>
            {mevki}
          </div>
          {revealed && (
            <div style={{ fontSize:12, color:"#7a9bb8", marginTop:3 }}>
              {fl(milliyet)} {milliyet}
            </div>
          )}
        </div>
        {!revealed && (
          <div style={{
            background:"rgba(245,166,35,.08)", border:"1px solid rgba(245,166,35,.2)",
            borderRadius:8, padding:"7px 12px",
            fontSize:11, fontWeight:800, color:"#f5a623",
            letterSpacing:".04em",
          }}>???</div>
        )}
      </div>

      {/* Stats grid */}
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {STAT_LABELS.map(({ key, label, icon, desc }) => (
          <div key={key}>
            <div style={{
              display:"flex", alignItems:"center", justifyContent:"space-between",
              marginBottom:5,
            }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:13 }}>{icon}</span>
                <span style={{ fontSize:12, fontWeight:600, color:"#7a9bb8" }}>{label}</span>
                <span style={{ fontSize:9, color:"#3d5a78", letterSpacing:".04em" }}>{desc}</span>
              </div>
              <span style={{
                fontSize:13, fontWeight:800, color:"#eef2f7",
                fontVariantNumeric:"tabular-nums",
              }}>
                {stats[key]}
              </span>
            </div>
            <StatBar value={stats[key]} max={STAT_MAXES[key]} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Score display ─────────────────────────────────────────────────
function ScoreDisplay({ score, streak }) {
  const fireEmoji = streak >= 5 ? "🔥🔥🔥" : streak >= 3 ? "🔥🔥" : streak >= 1 ? "🔥" : "❄️";
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:0,
      background:"linear-gradient(160deg,#162840 0%,#0f2035 100%)",
      border:"1px solid rgba(255,255,255,.07)",
      borderRadius:12, marginBottom:16, overflow:"hidden",
    }}>
      <div style={{ flex:1, textAlign:"center", padding:"14px 10px" }}>
        <div style={{
          fontSize:28, fontWeight:900, color:"#f5a623",
          letterSpacing:"-1px", fontVariantNumeric:"tabular-nums",
        }}>{score}</div>
        <div style={{ fontSize:9, fontWeight:800, color:"#3d5a78", letterSpacing:".1em" }}>PUAN</div>
      </div>
      <div style={{ width:1, height:40, background:"rgba(255,255,255,.07)" }} />
      <div style={{ flex:1, textAlign:"center", padding:"14px 10px" }}>
        <div style={{
          fontSize:28, fontWeight:900, color:"#00d65c",
          letterSpacing:"-1px",
        }}>{streak}</div>
        <div style={{ fontSize:9, fontWeight:800, color:"#3d5a78", letterSpacing:".1em" }}>SERİ</div>
      </div>
      <div style={{ width:1, height:40, background:"rgba(255,255,255,.07)" }} />
      <div style={{ flex:"0 0 64px", textAlign:"center", padding:"14px 0" }}>
        <div style={{ fontSize:22 }}>{fireEmoji}</div>
      </div>
    </div>
  );
}

// ─── Answer button ─────────────────────────────────────────────────
function AnswerBtn({ opt, state, onClick, disabled }) {
  const colors = {
    correct: { bg:"rgba(0,214,92,.1)", border:"rgba(0,214,92,.4)", text:"#00d65c" },
    wrong:   { bg:"rgba(255,71,87,.1)", border:"rgba(255,71,87,.35)", text:"#ff4757" },
    default: { bg:"rgba(255,255,255,.03)", border:"rgba(255,255,255,.08)", text:"#7a9bb8" },
  };
  const c = colors[state] || colors.default;
  const icon = state === "correct" ? "✅" : state === "wrong" ? "❌" : "👤";

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width:"100%", padding:"13px 16px",
        borderRadius:10, border:`1px solid ${c.border}`,
        background:c.bg,
        color:"#eef2f7", fontSize:13, fontWeight:600,
        cursor: disabled ? "default" : "pointer",
        textAlign:"left", marginBottom:7,
        display:"flex", alignItems:"center", gap:10,
        transition:"all .18s",
      }}
      onMouseEnter={e => {
        if (!disabled && state === "default") {
          e.currentTarget.style.background = "rgba(255,255,255,.06)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,.14)";
        }
      }}
      onMouseLeave={e => {
        if (!disabled && state === "default") {
          e.currentTarget.style.background = c.bg;
          e.currentTarget.style.borderColor = c.border;
        }
      }}
    >
      <span style={{ fontSize:15, flexShrink:0 }}>{icon}</span>
      <span style={{ color: state !== "default" ? c.text : "#eef2f7" }}>{opt.isim}</span>
    </button>
  );
}

// ─── Main ──────────────────────────────────────────────────────────
export default function QuizPage() {
  const [questionKey, setQuestionKey] = useState(0);
  const [selected,    setSelected]    = useState(null);
  const [revealed,    setRevealed]    = useState(false);
  const [score,       setScore]       = useState(0);
  const [streak,      setStreak]      = useState(0);
  const [history,     setHistory]     = useState([]);

  const { data: quiz, isLoading, isError, refetch } = useQuery({
    queryKey: ["quiz-random", questionKey],
    queryFn: () => fetch(`${API}/player-extras/quiz/random`).then(r => {
      if (!r.ok) throw new Error("no data");
      return r.json();
    }),
    retry: false,
  });

  const handleGuess = useCallback((option) => {
    if (revealed) return;
    setSelected(option.id);
    setRevealed(true);
    const correct = option.id === quiz.oyuncu_id;
    const pts = correct ? 100 + streak * 10 : 0;
    if (correct) { setScore(s => s + pts); setStreak(s => s + 1); }
    else          { setStreak(0); }
    const correctName = quiz?.secenekler?.find(o => o.id === quiz.oyuncu_id)?.isim ?? "?";
    setHistory(h => [{ correct, name: correctName, pts }, ...h.slice(0, 4)]);
  }, [revealed, quiz, streak]);

  function nextQuestion() {
    setSelected(null);
    setRevealed(false);
    setQuestionKey(k => k + 1);
  }

  return (
    <div style={{ maxWidth:540, margin:"0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom:20 }}>
        <h2 style={{
          fontSize:"clamp(20px,4vw,28px)", fontWeight:900,
          color:"#eef2f7", letterSpacing:"-.5px", marginBottom:4,
        }}>🕵️ Kim Bu Oyuncu?</h2>
        <p style={{ fontSize:12, color:"#4d6380", letterSpacing:".02em" }}>
          İstatistiklere bakarak oyuncuyu tahmin et · Seri bonus
        </p>
      </div>

      <ScoreDisplay score={score} streak={streak} />

      {/* Loading */}
      {isLoading && (
        <div style={{ textAlign:"center", padding:"52px 0" }}>
          <div style={{ fontSize:40, marginBottom:12,
            animation:"spin 1s linear infinite", display:"inline-block" }}>🎲</div>
          <div style={{ color:"#4d6380", fontSize:13 }}>Soru hazırlanıyor…</div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {/* Error */}
      {isError && (
        <div style={{
          textAlign:"center", padding:"36px 20px",
          background:"rgba(255,71,87,.06)", borderRadius:14,
          border:"1px solid rgba(255,71,87,.2)",
        }}>
          <div style={{ color:"#ff4757", marginBottom:12, fontSize:13 }}>
            ⚠️ Veri yüklenemedi
          </div>
          <button onClick={() => refetch()} style={{
            padding:"8px 20px", borderRadius:8,
            background:"linear-gradient(135deg,#f5a623,#e07b0c)",
            color:"#0f1e2e", border:"none", cursor:"pointer", fontWeight:700, fontSize:12,
          }}>Tekrar Dene</button>
        </div>
      )}

      {/* Question */}
      {quiz && !isLoading && (
        <div style={{ animation:"hh-fadein .3s ease" }}>
          <StatsCard
            stats={quiz.stats}
            mevki={quiz.mevki}
            milliyet={quiz.milliyet}
            revealed={revealed}
          />

          {/* Options */}
          <div style={{ marginTop:14 }}>
            <div style={{
              fontSize:9, fontWeight:800, color:"#3d5a78",
              letterSpacing:".12em", marginBottom:10,
            }}>BU OYUNCU KİM?</div>
            {quiz.secenekler.map(opt => {
              let state = "default";
              if (revealed) {
                if (opt.id === quiz.oyuncu_id) state = "correct";
                else if (opt.id === selected)  state = "wrong";
              }
              return (
                <AnswerBtn
                  key={opt.id}
                  opt={opt}
                  state={state}
                  onClick={() => handleGuess(opt)}
                  disabled={revealed}
                />
              );
            })}
          </div>

          {/* Reveal + next */}
          {revealed && (
            <div style={{
              marginTop:14, padding:"16px 18px",
              background: selected === quiz.oyuncu_id
                ? "rgba(0,214,92,.07)"
                : "rgba(255,71,87,.07)",
              border:`1px solid ${selected === quiz.oyuncu_id ? "rgba(0,214,92,.2)" : "rgba(255,71,87,.2)"}`,
              borderRadius:12,
              textAlign:"center",
              animation:"hh-fadein .25s ease",
            }}>
              <div style={{
                fontSize:22, fontWeight:900, marginBottom:6,
                color: selected === quiz.oyuncu_id ? "#00d65c" : "#ff4757",
              }}>
                {selected === quiz.oyuncu_id ? "🎉 Doğru!" : "😅 Yanlış"}
              </div>
              {selected !== quiz.oyuncu_id && (
                <div style={{ fontSize:13, color:"#7a9bb8", marginBottom:12 }}>
                  Cevap:{" "}
                  <strong style={{ color:"#f5a623" }}>
                    {quiz.secenekler.find(o => o.id === quiz.oyuncu_id)?.isim}
                  </strong>
                </div>
              )}
              {selected === quiz.oyuncu_id && streak > 0 && (
                <div style={{ fontSize:11, color:"#7a9bb8", marginBottom:12 }}>
                  +{100 + (streak-1)*10} puan · {streak} maçlık seri 🔥
                </div>
              )}
              <button onClick={nextQuestion} style={{
                padding:"11px 28px", borderRadius:10,
                background:"linear-gradient(135deg,#f5a623 0%,#e07b0c 100%)",
                color:"#0f1e2e", border:"none", cursor:"pointer",
                fontSize:13, fontWeight:800,
                boxShadow:"0 4px 16px rgba(245,166,35,.3)",
                transition:"transform .15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.transform = "none"; }}
              >
                Sonraki Soru →
              </button>
            </div>
          )}

          {/* History */}
          {history.length > 0 && (
            <div style={{ marginTop:18 }}>
              <div style={{
                fontSize:9, fontWeight:800, color:"#3d5a78",
                letterSpacing:".1em", marginBottom:8,
              }}>SON CEVAPLAR</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                {history.map((h, i) => (
                  <div key={i} style={{
                    padding:"4px 10px", borderRadius:99, fontSize:11, fontWeight:600,
                    background: h.correct ? "rgba(0,214,92,.1)" : "rgba(255,71,87,.1)",
                    color: h.correct ? "#00d65c" : "#ff4757",
                    border:`1px solid ${h.correct ? "rgba(0,214,92,.25)" : "rgba(255,71,87,.25)"}`,
                  }}>
                    {h.correct ? "✅" : "❌"} {h.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
