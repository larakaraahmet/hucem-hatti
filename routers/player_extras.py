"""Oyuncu ek endpoint'leri — kariyer yayı, son form, quiz."""

from __future__ import annotations
import random
from fastapi import APIRouter, HTTPException
from sqlalchemy import text
from db import get_engine

router = APIRouter(prefix="/player-extras", tags=["player-extras"])

# ─── Kariyer Yayı ────────────────────────────────────────────────────────────
_SQL_CAREER_ARC = text("""
    SELECT
        EXTRACT(YEAR FROM m.tarih)::int                                        AS yil,
        EXTRACT(YEAR FROM AGE(m.tarih, p.dogum_tarihi))::int                   AS yas,
        -- xG/90: statsbomb has dakika, understat doesn't; fallback to xG/maç * 90/90
        CASE
            WHEN SUM(COALESCE(pm.dakika, 0)) > 0
                THEN SUM(pm.xg) / SUM(pm.dakika) * 90
            ELSE AVG(pm.xg)  -- per-match average when no dakika
        END                                                                     AS xg90,
        CASE
            WHEN SUM(COALESCE(pm.dakika, 0)) > 0
                THEN SUM(pm.xa) / SUM(pm.dakika) * 90
            ELSE AVG(pm.xa)
        END                                                                     AS xa90,
        CASE
            WHEN SUM(COALESCE(pm.dakika, 0)) > 0
                THEN SUM(pm.gol) / SUM(pm.dakika) * 90
            ELSE AVG(pm.gol::numeric)
        END                                                                     AS gol90,
        COALESCE(SUM(pm.dakika), COUNT(*) * 90)                                AS toplam_dk
    FROM player_match_stats pm
    JOIN matches m ON pm.mac_id = m.id
    JOIN players p ON p.id = pm.oyuncu_id
    WHERE pm.oyuncu_id = :oyuncu_id
      AND pm.xg IS NOT NULL
      AND p.dogum_tarihi IS NOT NULL
    GROUP BY yil, yas
    ORDER BY yil
""")

@router.get("/{oyuncu_id}/career-arc", summary="Kariyer boyunca xG/90 eğrisi")
def career_arc(oyuncu_id: int) -> dict:
    engine = get_engine()
    with engine.connect() as c:
        rows = c.execute(_SQL_CAREER_ARC, {"oyuncu_id": oyuncu_id}).mappings().all()

    if not rows:
        raise HTTPException(404, "Kariyer verisi bulunamadı")

    points = []
    for r in rows:
        xg90 = float(r["xg90"] or 0)
        points.append({
            "yil":     r["yil"],
            "yas":     r["yas"],
            "xg90":    round(xg90, 3),
            "xa90":    round(float(r["xa90"] or 0), 3),
            "gol90":   round(float(r["gol90"] or 0), 3),
            "dakika":  int(r["toplam_dk"] or 0),
        })

    # En yüksek xG90 → "zirve"
    peak = max(points, key=lambda p: p["xg90"])
    # Son 2 nokta eğilimi
    if len(points) >= 2:
        trend_delta = points[-1]["xg90"] - points[-2]["xg90"]
        trend = "rising" if trend_delta > 0.05 else "falling" if trend_delta < -0.05 else "stable"
    else:
        trend = "stable"

    return {
        "noktalar": points,
        "zirve":    peak,
        "trend":    trend,
    }


# ─── Son Form Skoru ───────────────────────────────────────────────────────────
_SQL_LAST5 = text("""
    SELECT
        m.tarih,
        pm.xg,
        pm.xa,
        pm.gol,
        pm.asist,
        COALESCE(pm.dakika, 90) AS dakika,
        pm.sut
    FROM player_match_stats pm
    JOIN matches m ON pm.mac_id = m.id
    WHERE pm.oyuncu_id = :oyuncu_id
      AND (pm.xg IS NOT NULL OR pm.xa IS NOT NULL)
    ORDER BY m.tarih DESC
    LIMIT 5
""")

@router.get("/{oyuncu_id}/form", summary="Son 5 maç form skoru")
def player_form(oyuncu_id: int) -> dict:
    engine = get_engine()
    with engine.connect() as c:
        rows = c.execute(_SQL_LAST5, {"oyuncu_id": oyuncu_id}).mappings().all()

    if not rows:
        return {"skor": 0, "emoji": "❄️", "label": "Veri yok", "maclar": []}

    maclar = []
    for r in rows:
        xg  = float(r["xg"]  or 0)
        xa  = float(r["xa"]  or 0)
        gol = int(r["gol"]   or 0)
        ast = int(r["asist"] or 0)
        dk  = int(r["dakika"]or 0)
        if dk < 20:
            continue
        # Katkı skoru: xG + xA + gol*0.2 + asist*0.1 (ceza bonusu)
        katki = xg + xa + gol * 0.2 + ast * 0.1
        maclar.append({
            "tarih": str(r["tarih"]),
            "xg":    round(xg,  2),
            "xa":    round(xa,  2),
            "gol":   gol,
            "asist": ast,
            "katki": round(katki, 2),
        })

    if not maclar:
        return {"skor": 0, "emoji": "❄️", "label": "Veri yok", "maclar": []}

    avg = sum(m["katki"] for m in maclar) / len(maclar)

    # 0–10 form skoru
    skor = round(min(avg / 0.5 * 10, 10), 1)

    if skor >= 8:
        emoji, label = "🔥🔥", "Alev Alev"
    elif skor >= 6:
        emoji, label = "🔥", "Formda"
    elif skor >= 4:
        emoji, label = "💪", "İyi"
    elif skor >= 2:
        emoji, label = "😐", "Ortalama"
    else:
        emoji, label = "❄️", "Düşük Form"

    return {
        "skor":   skor,
        "emoji":  emoji,
        "label":  label,
        "maclar": maclar,
        "trend": [m["katki"] for m in reversed(maclar)],
    }


# ─── Quiz: Oyuncuyu Tahmin Et ─────────────────────────────────────────────────
_SQL_RANDOM_PLAYER = text("""
    SELECT
        p.id,
        p.isim,
        p.mevki,
        p.milliyet,
        -- Statsbomb players have dakika; understat don't — use match count as proxy
        CASE
            WHEN SUM(COALESCE(pm.dakika,0)) > 0
                THEN SUM(pm.xg) / SUM(pm.dakika) * 90
            ELSE AVG(pm.xg)
        END  AS xg90,
        CASE
            WHEN SUM(COALESCE(pm.dakika,0)) > 0
                THEN SUM(pm.xa) / SUM(pm.dakika) * 90
            ELSE AVG(pm.xa)
        END  AS xa90,
        CASE
            WHEN SUM(COALESCE(pm.dakika,0)) > 0
                THEN SUM(pm.gol) / SUM(pm.dakika) * 90
            ELSE AVG(pm.gol::numeric)
        END  AS gol90,
        CASE
            WHEN SUM(COALESCE(pm.dakika,0)) > 0
                THEN SUM(pm.asist) / SUM(pm.dakika) * 90
            ELSE AVG(pm.asist::numeric)
        END  AS asist90,
        CASE
            WHEN SUM(COALESCE(pm.dakika,0)) > 0
                THEN SUM(pm.sut) / SUM(pm.dakika) * 90
            ELSE AVG(pm.sut::numeric)
        END  AS sut90,
        CASE
            WHEN SUM(COALESCE(pm.dakika,0)) > 0
                THEN SUM(pm.progressive_pass) / SUM(pm.dakika) * 90
            ELSE AVG(pm.progressive_pass::numeric)
        END  AS prog90,
        COUNT(*) AS mac_sayisi
    FROM players p
    JOIN player_match_stats pm ON p.id = pm.oyuncu_id
    WHERE pm.xg IS NOT NULL
    GROUP BY p.id, p.isim, p.mevki, p.milliyet
    HAVING COUNT(*) >= 5
      AND SUM(pm.xg) > 1.0
      AND SUM(pm.xg) < 30  -- aşırı değerleri filtrele
    ORDER BY RANDOM()
    LIMIT 10
""")

_SQL_OPTIONS = text("""
    SELECT id, isim FROM players
    WHERE has_data = true
    ORDER BY RANDOM()
    LIMIT 3
""")

@router.get("/quiz/random", summary="Rastgele oyuncu — isim gizli")
def quiz_random() -> dict:
    engine = get_engine()
    with engine.connect() as c:
        rows  = c.execute(_SQL_RANDOM_PLAYER).mappings().all()
        if not rows:
            raise HTTPException(404, "Yeterli oyuncu verisi yok")
        player = dict(rows[0])

        # 3 yanlış seçenek + 1 doğru → karıştır
        opts_rows = c.execute(_SQL_OPTIONS).mappings().all()

    correct_id   = player["id"]
    correct_isim = player["isim"]

    # Yanlış seçenekler (doğru oyuncuyu hariç tut)
    wrong = [{"id": r["id"], "isim": r["isim"]} for r in opts_rows if r["id"] != correct_id][:3]
    options = wrong + [{"id": correct_id, "isim": correct_isim}]
    random.shuffle(options)

    def cap(v, maximum=2.0):
        return round(min(float(v or 0), maximum), 2)

    return {
        "oyuncu_id": correct_id,
        "mevki":     player["mevki"],
        "milliyet":  player["milliyet"],
        "stats": {
            "xg90":    cap(player["xg90"],   1.5),
            "xa90":    cap(player["xa90"],   0.8),
            "gol90":   cap(player["gol90"],  1.2),
            "asist90": cap(player["asist90"],0.8),
            "sut90":   round(min(float(player["sut90"]  or 0), 5.0), 1),
            "prog90":  round(min(float(player["prog90"] or 0), 3.0), 2),
        },
        "secenekler": options,
    }
