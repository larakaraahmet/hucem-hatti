/**
 * Grup Aşaması Simülatörü — WC 2026 grubu simüle et, ilerleme ihtimallerini göster
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
  England:"🏴󠁧󠁢󠁥󠁮󠁧󠁿",France:"🇫🇷",Germany:"🇩🇪",Ghana:"🇬🇦",
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

function ProbBar({ pct, color = "#22c55e", label, small }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:8, width:"100%" }}>
      {label && <span style={{ fontSize:11, color:"#94a3b8", width:80, textAlign:"right", flexShrink:0 }}>{label}</span>}
      <div style={{
        flex:1, height: small ? 8 : 12, borderRadius:99,
        background:"rgba(255,255,255,.07)", overflow:"hidden",
      }}>
        <div style={{
          width:`${Math.min(pct, 100)}%`, height:"100%",
          background: color,
          borderRadius:99,
          transition:"width .6s cubic-bezier(.4,0,.2,1)",
          boxShadow:`0 0 8px ${color}66`,
        }} />
      </div>
      <span style={{ fontSize: small ? 11 : 13, fontWeight:700, color:"#f1f5f9", minWidth:38, textAlign:"right" }}>
        {pct.toFixed(1)}%
      </span>
    </div>
  );
}

function TeamRow({ rank, name, stats, highlight }) {
  const isTop2 = rank <= 2;
  return (
    <div style={{
      display:"grid",
      gridTemplateColumns:"28px 1fr 80px 60px 60px",
      gap:8, alignItems:"center",
      padding:"12px 14px",
      borderRadius:10,
      background: highlight
        ? "rgba(245,158,11,.1)"
        : isTop2
          ? "rgba(34,197,94,.06)"
          : "rgba(255,255,255,.03)",
      border: `1px solid ${highlight ? "rgba(245,158,11,.3)" : isTop2 ? "rgba(34,197,94,.15)" : "rgba(255,255,255,.07)"}`,
      marginBottom:6,
    }}>
      {/* Sıra */}
      <div style={{
        width:24, height:24, borderRadius:6,
        background: rank === 1 ? "#f59e0b" : rank === 2 ? "#94a3b8" : "rgba(255,255,255,.08)",
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:12, fontWeight:800,
        color: rank <= 2 ? "#0f172a" : "#94a3b8",
      }}>{rank}</div>

      {/* Takım */}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ fontSize:20 }}>{fl(name)}</span>
        <div>
          <div style={{ fontSize:14, fontWeight:600, color:"#f1f5f9" }}>{name}</div>
          {isTop2 && <div style={{ fontSize:10, color:"#22c55e", fontWeight:600, letterSpacing:.5 }}>
            ✓ GRUPTAN ÇIKMA
          </div>}
        </div>
      </div>

      {/* Ort. Puan */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:18, fontWeight:800, color:"#f59e0b" }}>{stats.avg_pts}</div>
        <div style={{ fontSize:10, color:"#64748b" }}>ort. puan</div>
      </div>

      {/* İlerleme % */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:16, fontWeight:700, color: isTop2 ? "#22c55e" : "#94a3b8" }}>
          {stats.top2_pct}%
        </div>
        <div style={{ fontSize:10, color:"#64748b" }}>ilerleme</div>
      </div>

      {/* Birinci % */}
      <div style={{ textAlign:"center" }}>
        <div style={{ fontSize:13, fontWeight:600, color:"#fbbf24" }}>{stats.winner_pct}%</div>
        <div style={{ fontSize:10, color:"#64748b" }}>1. olma</div>
      </div>
    </div>
  );
}

function MatchCard({ match }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"10px 14px", borderRadius:8,
      background:"rgba(255,255,255,.04)",
      border:"1px solid rgba(255,255,255,.07)",
      marginBottom:6,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, flex:1, justifyContent:"flex-end" }}>
        <span style={{ fontSize:13, color:"#e2e8f0" }}>{match.ev}</span>
        <span style={{ fontSize:18 }}>{fl(match.ev)}</span>
      </div>
      <div style={{
        padding:"4px 12px", margin:"0 12px",
        background:"rgba(245,158,11,.15)", borderRadius:6,
        fontSize:11, fontWeight:700, color:"#f59e0b", letterSpacing:1,
      }}>VS</div>
      <div style={{ display:"flex", alignItems:"center", gap:8, flex:1 }}>
        <span style={{ fontSize:18 }}>{fl(match.dep)}</span>
        <span style={{ fontSize:13, color:"#e2e8f0" }}>{match.dep}</span>
      </div>
    </div>
  );
}

export default function GroupSimPage() {
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [result, setResult] = useState(null);

  // Tüm grupları listele
  const { data: groups = [] } = useQuery({
    queryKey: ["groups"],
    queryFn: () => fetch(`${API}/group-simulate/groups`).then(r => r.json()),
  });

  const mutation = useMutation({
    mutationFn: (grup) =>
      fetch(`${API}/group-simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grup }),
      }).then(r => {
        if (!r.ok) throw new Error("Simülasyon hatası");
        return r.json();
      }),
    onSuccess: (data) => setResult(data),
  });

  function handleSelect(grup) {
    setSelectedGroup(grup);
    setResult(null);
    mutation.mutate(grup);
  }

  const S = {
    page: {
      minHeight: "100vh",
      padding: "24px 16px 100px",
      maxWidth: 700,
      margin: "0 auto",
    },
    heading: {
      fontSize: 26,
      fontWeight: 800,
      color: "#f1f5f9",
      marginBottom: 6,
    },
    sub: {
      fontSize: 14,
      color: "#64748b",
      marginBottom: 28,
    },
    groupGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(6, 1fr)",
      gap: 10,
      marginBottom: 32,
    },
    groupBtn: (active) => ({
      padding: "12px 0",
      borderRadius: 10,
      border: `2px solid ${active ? "#f59e0b" : "rgba(255,255,255,.1)"}`,
      background: active
        ? "rgba(245,158,11,.15)"
        : "rgba(255,255,255,.04)",
      color: active ? "#f59e0b" : "#94a3b8",
      fontSize: 18,
      fontWeight: 800,
      cursor: "pointer",
      transition: "all .2s",
      textAlign: "center",
    }),
    card: {
      background: "rgba(255,255,255,.03)",
      border: "1px solid rgba(255,255,255,.08)",
      borderRadius: 14,
      padding: "20px",
      marginBottom: 20,
    },
    cardTitle: {
      fontSize: 13,
      fontWeight: 700,
      color: "#64748b",
      letterSpacing: 1,
      textTransform: "uppercase",
      marginBottom: 14,
    },
  };

  return (
    <div style={S.page}>
      <div style={S.heading}>🏆 Grup Aşaması Simülatörü</div>
      <div style={S.sub}>
        Her grup için 50.000 turnuva simülasyonu · ilerleme ihtimalleri
      </div>

      {/* Grup seçimi */}
      <div style={S.groupGrid}>
        {groups.map(g => (
          <button
            key={g}
            style={S.groupBtn(selectedGroup === g)}
            onClick={() => handleSelect(g)}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Yükleniyor */}
      {mutation.isPending && (
        <div style={{ textAlign:"center", padding:"60px 0" }}>
          <div style={{
            fontSize:40, marginBottom:16,
            animation:"spin 1.2s linear infinite",
          }}>⚽</div>
          <div style={{ color:"#64748b", fontSize:14 }}>
            50.000 turnuva simüle ediliyor…
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Hata */}
      {mutation.isError && (
        <div style={{
          padding:20, borderRadius:12, background:"rgba(239,68,68,.1)",
          border:"1px solid rgba(239,68,68,.3)", color:"#fca5a5", textAlign:"center",
        }}>
          Simülasyon başarısız oldu. Tekrar dene.
        </div>
      )}

      {/* Sonuçlar */}
      {result && (
        <>
          {/* Puan tablosu */}
          <div style={S.card}>
            <div style={S.cardTitle}>📊 Grup {result.grup} — Tahmini Sıralama</div>
            {result.takim_siralama.map((name, idx) => (
              <TeamRow
                key={name}
                rank={idx + 1}
                name={name}
                stats={result.sonuclar[name]}
              />
            ))}
          </div>

          {/* İlerleme ihtimali bar chart */}
          <div style={S.card}>
            <div style={S.cardTitle}>🚀 Gruptan Çıkma İhtimali</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {result.takim_siralama.map(name => (
                <div key={name} style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                    <span style={{ fontSize:16 }}>{fl(name)}</span>
                    <span style={{ fontSize:13, color:"#e2e8f0", fontWeight:500 }}>{name}</span>
                  </div>
                  <ProbBar
                    pct={result.sonuclar[name].top2_pct}
                    color={result.sonuclar[name].top2_pct >= 50 ? "#22c55e" : "#94a3b8"}
                    small
                  />
                  <div style={{ display:"flex", gap:16, paddingLeft:4 }}>
                    <ProbBar
                      pct={result.sonuclar[name].winner_pct}
                      color="#f59e0b"
                      label="1. olma"
                      small
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Maçlar */}
          <div style={S.card}>
            <div style={S.cardTitle}>📅 Grup {result.grup} Maçları</div>
            {result.maclar.map((m, i) => (
              <MatchCard key={i} match={m} />
            ))}
          </div>

          {/* Uyarı: veri eksikliği */}
          {result.veri_eksik.length > 0 && (
            <div style={{
              padding:"12px 16px", borderRadius:10,
              background:"rgba(245,158,11,.08)",
              border:"1px solid rgba(245,158,11,.2)",
              fontSize:12, color:"#fbbf24",
            }}>
              ⚠️ Şu takımlar için yeterli oyuncu verisi yok — varsayılan değerler kullanıldı:{" "}
              {result.veri_eksik.join(", ")}
            </div>
          )}
        </>
      )}

      {/* İlk açılış — grup seçilmemiş */}
      {!selectedGroup && !mutation.isPending && (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#475569" }}>
          <div style={{ fontSize:64, marginBottom:16 }}>🌍</div>
          <div style={{ fontSize:18, fontWeight:600, marginBottom:8, color:"#94a3b8" }}>
            Bir grup seç
          </div>
          <div style={{ fontSize:13 }}>
            A'dan L'ye 12 grup — her biri 50.000 kez simüle edilir
          </div>
        </div>
      )}
    </div>
  );
}
