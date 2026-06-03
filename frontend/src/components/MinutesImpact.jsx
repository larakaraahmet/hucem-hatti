/**
 * MinutesImpact — Tam maç (>75 dk) vs yedek (<60 dk) performans karşılaştırması.
 * İddaa için: "Bu oyuncu sadece tam oynarken tehlikeli mi?"
 */
import { useEffect, useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

function avg(arr, key) {
  if (!arr.length) return 0;
  return arr.reduce((a, m) => a + (m[key] ?? 0), 0) / arr.length;
}

export default function MinutesImpact({ playerId, competition }) {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/player/${playerId}/matches${competition ? `?turnuva=${encodeURIComponent(competition)}` : ""}`)
      .then(r => r.ok ? r.json() : [])
      .then(d => { setMatches(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [playerId, competition]);

  if (loading) return <Wrap><div style={st.empty}>Yükleniyor…</div></Wrap>;
  if (!matches.length) return <Wrap><div style={st.empty}>Veri yok</div></Wrap>;

  const full = matches.filter(m => (m.dakika ?? 90) >= 75);   // tam oynayan
  const sub  = matches.filter(m => (m.dakika ?? 90) <  60);   // yedek
  const mid  = matches.filter(m => { const d = m.dakika ?? 90; return d >= 60 && d < 75; });

  if (full.length === 0 && sub.length === 0) {
    return <Wrap><div style={st.empty}>Dakika verisi yetersiz</div></Wrap>;
  }

  // Metrikler
  function stats(list) {
    if (!list.length) return null;
    const n    = list.length;
    const dk   = list.reduce((a, m) => a + (m.dakika ?? 90), 0);
    const gol  = list.reduce((a, m) => a + m.gol,   0);
    const asist= list.reduce((a, m) => a + m.asist, 0);
    const xg   = list.reduce((a, m) => a + (m.xg ?? 0), 0);
    const sut  = list.reduce((a, m) => a + m.sut,   0);
    const aktif = list.filter(m => m.gol > 0 || m.asist > 0).length;
    const per90 = (val) => dk > 0 ? val / dk * 90 : 0;
    return { n, gol, asist, xg, sut, aktif,
      golPer90: per90(gol), asistPer90: per90(asist),
      xgPer90:  per90(xg),  sutPer90:   per90(sut),
      katkiOran: aktif / n * 100,
      avgDk: dk / n,
    };
  }

  const F = stats(full);
  const S = sub.length >= 2 ? stats(sub) : null;

  const verdict = !S ? null
    : F.xgPer90 > S.xgPer90 * 1.2 ? { label: "Starter olunca çok daha tehlikeli", color: "#10b981", icon: "🔥" }
    : S.xgPer90 > F.xgPer90 * 1.2 ? { label: "Yedek girince de etkili", color: "#f59e0b", icon: "⚡" }
    : { label: "Oynanma süresinden bağımsız etkili", color: "#38bdf8", icon: "⚖️" };

  const ROWS = [
    { label: "xG / 90",     fKey: "xgPer90",    fmt: v => v.toFixed(2), color: "#f59e0b" },
    { label: "Gol / 90",    fKey: "golPer90",   fmt: v => v.toFixed(2), color: "#22c55e" },
    { label: "Asist / 90",  fKey: "asistPer90", fmt: v => v.toFixed(2), color: "#38bdf8" },
    { label: "Şut / 90",    fKey: "sutPer90",   fmt: v => v.toFixed(1), color: "#a78bfa" },
    { label: "Katkılı %",   fKey: "katkiOran",  fmt: v => v.toFixed(0)+"%", color: "#10b981" },
  ];

  function CompareRow({ label, fKey, fmt, color }) {
    const fv = F ? F[fKey] : 0;
    const sv = S ? S[fKey] : null;
    const maxV = Math.max(fv, sv ?? 0, 0.01);
    const fBetter = sv === null || fv >= sv;
    return (
      <div style={st.row}>
        <span style={st.rowLabel}>{label}</span>
        <div style={st.cells}>
          {/* Tam maç */}
          <div style={st.cell}>
            <span style={{ ...st.cellVal, color: fBetter ? color : "#475569" }}>{fmt(fv)}</span>
            <div style={st.miniBar}>
              <div style={{ ...st.miniFill, width: `${fv / maxV * 100}%`, background: fBetter ? color : "#334155" }} />
            </div>
          </div>
          {/* Yedek */}
          <div style={st.cell}>
            {sv !== null ? (
              <>
                <span style={{ ...st.cellVal, color: !fBetter ? color : "#475569" }}>{fmt(sv)}</span>
                <div style={st.miniBar}>
                  <div style={{ ...st.miniFill, width: `${sv / maxV * 100}%`, background: !fBetter ? color : "#334155" }} />
                </div>
              </>
            ) : (
              <span style={{ color: "#d1d5db", fontSize: 11 }}>Az veri</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Wrap>
      <div style={st.header}>
        <span style={st.title}>⏱️ Süre Etkisi</span>
        {verdict && (
          <div style={{ ...st.verdictBadge, borderColor: verdict.color + "44", background: verdict.color + "10" }}>
            <span style={{ color: verdict.color, fontSize: 10, fontWeight: 700 }}>
              {verdict.icon} {verdict.label}
            </span>
          </div>
        )}
      </div>

      {/* Başlık satırı */}
      <div style={st.colHead}>
        <span style={{ width: 110, flexShrink: 0 }} />
        <div style={st.colCells}>
          <span style={{ ...st.colLabel, color: "#10b981" }}>⚡ Tam Maç<br/><small>{F?.n ?? 0} maç · ort.{F ? Math.round(F.avgDk) : 0}dk</small></span>
          <span style={{ ...st.colLabel, color: "#f59e0b" }}>🔄 Yedek<br/><small>{S?.n ?? 0} maç</small></span>
        </div>
      </div>

      <div style={st.rowList}>
        {ROWS.map(r => <CompareRow key={r.label} {...r} />)}
      </div>

      {/* Maç tipi dağılımı */}
      <div style={st.footer}>
        {[
          { label: "Tam Maç",   n: full.length, c: "#10b981", sub: "≥75 dk" },
          { label: "Orta",      n: mid.length,  c: "#f59e0b", sub: "60-74 dk" },
          { label: "Yedek",     n: sub.length,  c: "#38bdf8", sub: "<60 dk" },
        ].map(({ label, n, c, sub }) => (
          <div key={label} style={st.footItem}>
            <span style={{ ...st.footVal, color: c }}>{n}</span>
            <span style={st.footLabel}>{label}</span>
            <span style={st.footSub}>{sub}</span>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function Wrap({ children }) {
  return (
    <div style={{
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: 16, overflow: "hidden", width: "100%",
    }}>{children}</div>
  );
}

const st = {
  header: {
    display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8,
    padding: "14px 18px 12px",
    borderBottom: "1px solid #f1f5f9",
    background: "#fafafa",
  },
  title: { color: "#0f172a", fontSize: 13, fontWeight: 700 },
  verdictBadge: { padding: "4px 12px", borderRadius: 8, border: "1px solid" },

  colHead: { display: "flex", alignItems: "center", padding: "8px 16px 4px" },
  colCells: { flex: 1, display: "flex" },
  colLabel: { flex: 1, fontSize: 10, fontWeight: 700, letterSpacing: ".03em", textAlign: "center", lineHeight: 1.5 },

  rowList: { display: "flex", flexDirection: "column" },
  row: {
    display: "flex", alignItems: "center", gap: 12,
    padding: "7px 16px",
    borderTop: "1px solid #f1f5f9",
  },
  rowLabel: { color: "#64748b", fontSize: 11, fontWeight: 600, width: 110, flexShrink: 0 },
  cells: { flex: 1, display: "flex", gap: 8 },
  cell:  { flex: 1, display: "flex", flexDirection: "column", gap: 4, alignItems: "center" },
  cellVal: { fontSize: 14, fontWeight: 800, lineHeight: 1 },
  miniBar: { width: "80%", height: 4, background: "#e2e8f0", borderRadius: 2, overflow: "hidden" },
  miniFill: { height: "100%", borderRadius: 2, transition: "width .5s ease" },

  footer: {
    display: "flex",
    borderTop: "1px solid #f1f5f9",
  },
  footItem:  { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 4px", gap: 2 },
  footVal:   { fontSize: 20, fontWeight: 900, lineHeight: 1 },
  footLabel: { fontSize: 9, color: "#94a3b8", fontWeight: 700, letterSpacing: ".07em" },
  footSub:   { fontSize: 8, color: "#94a3b8" },
  empty: { color: "#94a3b8", fontSize: 13, padding: "30px 20px", textAlign: "center" },
};
