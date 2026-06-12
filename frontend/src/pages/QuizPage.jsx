/**
 * Kim Bu Oyuncu? — İstatistikleri gör, oyuncuyu tahmin et
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
  { key:"xg90",    label:"xG/90",        icon:"⚽", desc:"Beklenen Gol / 90 dk" },
  { key:"xa90",    label:"xA/90",        icon:"🎯", desc:"Beklenen Asist / 90 dk" },
  { key:"gol90",   label:"Gol/90",       icon:"🥅", desc:"Gol / 90 dk" },
  { key:"asist90", label:"Asist/90",     icon:"👟", desc:"Asist / 90 dk" },
  { key:"sut90",   label:"Şut/90",       icon:"💥", desc:"Şut / 90 dk" },
  { key:"prog90",  label:"İlerleme/90",  icon:"🚀", desc:"İlerleme Pası / 90 dk" },
];

// Donut (tek stat görsel)
function StatBar({ value, max, color }) {
  const pct = Math.min(value / max * 100, 100);
  return (
    <div style={{
      height:6, borderRadius:99,
      background:"rgba(255,255,255,.08)", overflow:"hidden",
    }}>
      <div style={{
        width:`${pct}%`, height:"100%",
        background: color,
        borderRadius:99,
        transition:"width .5s cubic-bezier(.4,0,.2,1)",
      }} />
    </div>
  );
}

const STAT_MAXES = { xg90:1.2, xa90:0.5, gol90:0.8, asist90:0.4, sut90:5.0, prog90:3.0 };

function StatsCard({ stats, mevki, milliyet, revealed }) {
  return (
    <div style={{
      background:"rgba(255,255,255,.04)",
      border:"1px solid rgba(255,255,255,.1)",
      borderRadius:16, padding:24,
    }}>
      {/* Gizli profil */}
      <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
        <div style={{
          width:64, height:64, borderRadius:99,
          background: revealed ? "transparent" : "linear-gradient(135deg,#1e293b,#0f172a)",
          border:"2px solid rgba(245,158,11,.3)",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:28,
          filter: revealed ? "none" : "blur(0)",
        }}>
          {revealed ? fl(milliyet) : "🕵️"}
        </div>
        <div>
          <div style={{ fontSize:13, color:"#64748b", marginBottom:2 }}>Mevki</div>
          <div style={{ fontSize:16, fontWeight:700, color:"#f59e0b" }}>{mevki}</div>
          {revealed && (
            <div style={{ fontSize:12, color:"#94a3b8", marginTop:2 }}>
              {fl(milliyet)} {milliyet}
            </div>
          )}
        </div>
        {!revealed && (
          <div style={{
            marginLeft:"auto",
            background:"rgba(245,158,11,.1)", border:"1px solid rgba(245,158,11,.3)",
            borderRadius:8, padding:"6px 12px",
            fontSize:11, color:"#f59e0b", fontWeight:700,
          }}>
            ???
          </div>
        )}
      </div>

      {/* Stats */}
      <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
        {STAT_LABELS.map(({ key, label, icon, desc }) => (
          <div key={key}>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:14 }}>{icon}</span>
                <span style={{ fontSize:13, color:"#e2e8f0" }}>{label}</span>
                <span style={{ fontSize:10, color:"#475569" }}>{desc}</span>
              </div>
              <span style={{ fontSize:14, fontWeight:700, color:"#f1f5f9" }}>
                {stats[key]}
              </span>
            </div>
            <StatBar
              value={stats[key]}
              max={STAT_MAXES[key]}
              color={stats[key] > STAT_MAXES[key] * 0.7 ? "#f59e0b" : stats[key] > STAT_MAXES[key] * 0.4 ? "#22c55e" : "#94a3b8"}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreDisplay({ score, streak }) {
  return (
    <div style={{
      display:"flex", gap:16, alignItems:"center",
      padding:"12px 20px",
      background:"rgba(255,255,255,.04)",
      border:"1px solid rgba(255,255,255,.08)",
      borderRadius:12, marginBottom:20,
    }}>
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:24, fontWeight:900, color:"#f59e0b" }}>{score}</div>
        <div style={{ fontSize:10, color:"#64748b" }}>PUAN</div>
      </div>
      <div style={{ width:1, height:32, background:"rgba(255,255,255,.1)" }} />
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:24, fontWeight:900, color:"#22c55e" }}>{streak}</div>
        <div style={{ fontSize:10, color:"#64748b" }}>SERI</div>
      </div>
      <div style={{ marginLeft:"auto", fontSize:20 }}>
        {streak >= 5 ? "🔥🔥🔥" : streak >= 3 ? "🔥🔥" : streak >= 1 ? "🔥" : "❄️"}
      </div>
    </div>
  );
}

export default function QuizPage() {
  const [questionKey, setQuestionKey] = useState(0);
  const [selected, setSelected]       = useState(null);
  const [revealed, setRevealed]       = useState(false);
  const [score,    setScore]          = useState(0);
  const [streak,   setStreak]         = useState(0);
  const [history,  setHistory]        = useState([]); // [{correct, playerName}]

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
    if (correct) {
      setScore(s => s + 100 + streak * 10);
      setStreak(s => s + 1);
    } else {
      setStreak(0);
    }
    setHistory(h => [{ correct, name: quiz?.secenekler?.find(o => o.id === quiz.oyuncu_id)?.isim ?? "?" }, ...h.slice(0, 4)]);
  }, [revealed, quiz, streak]);

  function nextQuestion() {
    setSelected(null);
    setRevealed(false);
    setQuestionKey(k => k + 1);
  }

  const S = {
    page: { minHeight:"100vh", padding:"24px 16px 100px", maxWidth:600, margin:"0 auto" },
    h1:   { fontSize:26, fontWeight:800, color:"#f1f5f9", marginBottom:6 },
    sub:  { fontSize:14, color:"#64748b", marginBottom:24 },
    optBtn: (state) => ({
      width:"100%", padding:"14px 18px",
      borderRadius:10, border:"2px solid",
      borderColor: state === "correct" ? "#22c55e" : state === "wrong" ? "#ef4444" : state === "neutral-selected" ? "#f59e0b" : "rgba(255,255,255,.1)",
      background: state === "correct" ? "rgba(34,197,94,.12)" : state === "wrong" ? "rgba(239,68,68,.12)" : "rgba(255,255,255,.04)",
      color: "#f1f5f9", fontSize:14, fontWeight:600,
      cursor: revealed ? "default" : "pointer",
      textAlign:"left", marginBottom:8,
      display:"flex", alignItems:"center", gap:10,
      transition:"all .2s",
    }),
  };

  return (
    <div style={S.page}>
      <div style={S.h1}>🕵️ Kim Bu Oyuncu?</div>
      <div style={S.sub}>İstatistiklere bakarak oyuncuyu tahmin et</div>

      <ScoreDisplay score={score} streak={streak} />

      {isLoading && (
        <div style={{ textAlign:"center", padding:60, color:"#64748b" }}>
          <div style={{ fontSize:40, marginBottom:12 }}>🎲</div>
          <div>Soru hazırlanıyor…</div>
        </div>
      )}

      {isError && (
        <div style={{ textAlign:"center", padding:40 }}>
          <div style={{ color:"#ef4444", marginBottom:12 }}>Veri yüklenemedi</div>
          <button onClick={() => refetch()} style={{
            padding:"8px 20px", borderRadius:8,
            background:"#f59e0b", color:"#0f172a", border:"none", cursor:"pointer", fontWeight:700,
          }}>Tekrar Dene</button>
        </div>
      )}

      {quiz && !isLoading && (
        <>
          <StatsCard
            stats={quiz.stats}
            mevki={quiz.mevki}
            milliyet={quiz.milliyet}
            revealed={revealed}
          />

          {/* Seçenekler */}
          <div style={{ marginTop:20 }}>
            <div style={{ fontSize:13, color:"#64748b", marginBottom:12 }}>Bu oyuncu kim?</div>
            {quiz.secenekler.map(opt => {
              let state = "default";
              if (revealed) {
                if (opt.id === quiz.oyuncu_id) state = "correct";
                else if (opt.id === selected)   state = "wrong";
              }
              return (
                <button key={opt.id} style={S.optBtn(state)} onClick={() => handleGuess(opt)}>
                  <span style={{ fontSize:16 }}>
                    {state === "correct" ? "✅" : state === "wrong" ? "❌" : "👤"}
                  </span>
                  {opt.isim}
                </button>
              );
            })}
          </div>

          {/* Sonuç + Sonraki soru */}
          {revealed && (
            <div style={{ marginTop:20, textAlign:"center" }}>
              <div style={{
                fontSize:20, fontWeight:800, marginBottom:8,
                color: selected === quiz.oyuncu_id ? "#22c55e" : "#ef4444",
              }}>
                {selected === quiz.oyuncu_id ? "🎉 Doğru!" : "😅 Yanlış"}
              </div>
              {selected !== quiz.oyuncu_id && (
                <div style={{ fontSize:14, color:"#94a3b8", marginBottom:12 }}>
                  Cevap: <strong style={{ color:"#f59e0b" }}>{quiz.secenekler.find(o => o.id === quiz.oyuncu_id)?.isim}</strong>
                </div>
              )}
              <button onClick={nextQuestion} style={{
                padding:"12px 32px", borderRadius:10,
                background:"linear-gradient(135deg, #f59e0b, #d97706)",
                color:"#0f172a", border:"none", cursor:"pointer",
                fontSize:15, fontWeight:800,
                boxShadow:"0 4px 20px rgba(245,158,11,.3)",
              }}>
                Sonraki Soru →
              </button>
            </div>
          )}

          {/* Geçmiş */}
          {history.length > 0 && (
            <div style={{ marginTop:24 }}>
              <div style={{ fontSize:12, color:"#475569", marginBottom:8 }}>Son Cevaplar</div>
              <div style={{ display:"flex", gap:6 }}>
                {history.map((h, i) => (
                  <div key={i} style={{
                    padding:"4px 10px", borderRadius:99, fontSize:11,
                    background: h.correct ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.12)",
                    color: h.correct ? "#22c55e" : "#ef4444",
                    border: `1px solid ${h.correct ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
                  }}>
                    {h.correct ? "✅" : "❌"} {h.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
