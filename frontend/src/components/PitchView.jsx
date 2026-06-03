/**
 * PitchView — Şut Haritası ve Isı Haritasını tek kaydırmalı
 * sekme bileşeni olarak sunar.
 */
import { useState } from "react";
import ShotMap from "./ShotMap.jsx";
import HeatMap from "./HeatMap.jsx";

const TABS = [
  { id: "shot",  label: "⚽ Şut Haritası" },
  { id: "heat",  label: "🔥 Isı Haritası"  },
];

export default function PitchView({ playerId, playerName, competition }) {
  const [active, setActive] = useState("shot");

  return (
    <div style={st.wrap}>
      {/* Tab bar */}
      <div style={st.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            style={{
              ...st.tab,
              ...(active === t.id ? st.tabActive : {}),
            }}
          >
            {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <span style={st.hint}>sekme</span>
      </div>

      {/* Panel — slide animasyonu */}
      <div style={st.panel} key={active}>
        {active === "shot" && (
          <ShotMap playerId={playerId} playerName={playerName} competition={competition} />
        )}
        {active === "heat" && (
          <HeatMap playerId={playerId} playerName={playerName} competition={competition} />
        )}
      </div>
    </div>
  );
}

const st = {
  wrap: {
    width: "100%",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    overflow: "hidden",
  },
  tabs: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "10px 14px",
    borderBottom: "1px solid rgba(255,255,255,0.07)",
    background: "#fafafa",
  },
  tab: {
    background: "transparent",
    border: "1px solid transparent",
    borderRadius: 8,
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 700,
    padding: "6px 16px",
    transition: "all .18s ease",
    letterSpacing: ".03em",
  },
  tabActive: {
    background: "rgba(245,158,11,.1)",
    border: "1px solid rgba(245,158,11,.28)",
    color: "#f59e0b",
    boxShadow: "0 0 12px rgba(245,158,11,.15)",
  },
  hint: {
    color: "#d1d5db",
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: ".1em",
    textTransform: "uppercase",
    paddingRight: 4,
  },
  panel: {
    animation: "hh-fade-up .25s ease forwards",
  },
};
