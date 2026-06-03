"""
sources/writer.py — IngestionResult → PostgreSQL yazıcısı
==========================================================

Her kaynaktan gelen IngestionResult'ları DB tablolarına yazar:
  - matches        → MatchRecord
  - player_external_stats → PlayerStatRecord
  - shots          → ShotRecord

Dedup kuralı:
  - matches:            (tarih, ev_takim_norm, dep_takim_norm) aynıysa
                        daha zengin kayıt kazanır (daha fazla dolu alan).
  - player_external_stats: (oyuncu_id, lig, sezon, kaynak) üçlüsüne ON CONFLICT DO UPDATE
  - shots:              (oyuncu_id, mac_id, x_yuvarlak, y_yuvarlak, kaynak) UNIQUE
"""

from __future__ import annotations

import logging
import re
from typing import Optional

from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

from .schema import IngestionResult, MatchRecord, PlayerStatRecord, ShotRecord

log = logging.getLogger(__name__)


# ── Yardımcı: isim normalize ─────────────────────────────────────────────────

_AKSANLAR = str.maketrans(
    "áàâäéèêëíìîïóòôöúùûüñçğşı",
    "aaaaeeeeiiiioooouuuuncgsi",
)

def _norm(s: str) -> str:
    """İsim normalize: küçük harf, aksanlar ASCII'ye, çift boşluk temizlenir."""
    return re.sub(r"\s+", " ", s.translate(_AKSANLAR).lower().strip())


# ── Oyuncu ID arama (fuzzy) ───────────────────────────────────────────────────

def _jaccard(a: str, b: str) -> float:
    ta, tb = set(a.split()), set(b.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _find_player_id(conn, isim: str, cache: dict) -> Optional[int]:
    """
    players tablosunda oyuncu ara. Önce tam eşleşme, sonra Jaccard ≥ 0.45.
    cache: {norm_isim → player_id} sözlüğü (tekrar DB'ye gitmemek için).
    """
    key = _norm(isim)
    if key in cache:
        return cache[key]

    # Exact match
    row = conn.execute(
        text("SELECT id FROM players WHERE LOWER(TRANSLATE(isim, 'áàâäéèêëíìîïóòôöúùûüñçğşı', 'aaaaeeeeiiiioooouuuuncgsi')) = :k"),
        {"k": key},
    ).fetchone()
    if row:
        cache[key] = row[0]
        return row[0]

    # Fuzzy: tüm oyuncuları yükle (zaten küçük bir tablo)
    if "__all__" not in cache:
        rows = conn.execute(text("SELECT id, isim FROM players")).fetchall()
        cache["__all__"] = [(r[0], _norm(r[1])) for r in rows]

    best_s, best_id = 0.0, None
    for pid, pname in cache["__all__"]:
        s = _jaccard(key, pname)
        if s > best_s:
            best_s, best_id = s, pid

    result = best_id if best_s >= 0.45 else None
    cache[key] = result
    return result


def _find_match_id(conn, tarih, ev_takim: str, dep_takim: str, turnuva: str) -> Optional[int]:
    """
    matches tablosunda maç ara (tarih + kısmi isim eşleşmesi).
    """
    h = _norm(ev_takim)[:8]
    a = _norm(dep_takim)[:8]
    row = conn.execute(text("""
        SELECT m.id
        FROM matches m
        JOIN teams ev  ON ev.id  = m.ev_takim_id
        JOIN teams dep ON dep.id = m.deplasman_takim_id
        WHERE m.tarih   = :tarih
          AND m.turnuva = :turnuva
          AND LOWER(ev.isim)  LIKE :h
          AND LOWER(dep.isim) LIKE :a
        LIMIT 1
    """), {"tarih": tarih, "turnuva": turnuva, "h": f"%{h}%", "a": f"%{a}%"}).fetchone()
    return row[0] if row else None


# ── Yazıcı ───────────────────────────────────────────────────────────────────

class DBWriter:
    """
    IngestionResult listesini PostgreSQL'e yazar.

    Kullanım:
        writer = DBWriter(engine)
        writer.write(results)
    """

    def __init__(self, engine: Engine):
        self.engine = engine

    def write(self, results: list[IngestionResult]) -> dict:
        """
        Tüm IngestionResult'ları işler.
        Dönüş: {"matches": N, "player_stats": N, "shots": N, "hatalar": N}
        """
        stats = {"matches": 0, "player_stats": 0, "shots": 0, "hatalar": 0}

        for result in results:
            if result.errors and not (result.matches or result.player_stats or result.shots):
                stats["hatalar"] += len(result.errors)
                continue

            try:
                with self.engine.begin() as conn:
                    # Oyuncu lookup cache'ini tek bağlantıda paylaş
                    player_cache: dict = {}

                    m_n = self._write_matches(conn, result.matches)
                    p_n = self._write_player_stats(conn, result.player_stats, player_cache)
                    s_n = self._write_shots(conn, result.shots, player_cache)

                    stats["matches"]      += m_n
                    stats["player_stats"] += p_n
                    stats["shots"]        += s_n

                    log.info(
                        "[writer] %s %s %s → matches+%d player_stats+%d shots+%d",
                        result.source, result.lig, result.sezon, m_n, p_n, s_n,
                    )
            except Exception as exc:
                log.error("[writer] %s %s %s HATA: %s", result.source, result.lig, result.sezon, exc)
                stats["hatalar"] += 1

        return stats

    # ── matches → club_historical_matches ────────────────────────────────────

    def _write_matches(self, conn, records: list[MatchRecord]) -> int:
        """
        MatchRecord'ları club_historical_matches tablosuna yazar.

        Kulüp ligi maçları için denormalize tablo kullanılır (FK yok).
        Milli takım turnuvası maçları (WC, Euro) zaten matches tablosunda;
        onlar StatsBomb / openfootball uluslararası akışı üzerinden geliyor,
        bu yüzden burada tekrar yazılmıyor.

        Uluslararası turnuvalar (turnuva içinde "World Cup", "Euro", "Copa")
        yazılmaz — matches tablosu o kayıtların sahibi.
        """
        ULUSLARARASI = ("world cup", "euro", "copa", "nations league")

        inserted = 0
        for rec in records:
            # Uluslararası turnuvaları atla
            t_lower = rec.turnuva.lower()
            if any(k in t_lower for k in ULUSLARARASI):
                continue

            # Sezon formatı normalize: "2024" → "2024/25"
            try:
                y = int(rec.sezon)
                sezon_fmt = f"{y}/{str(y+1)[-2:]}"
            except ValueError:
                sezon_fmt = rec.sezon

            # Sonuç karakteri
            if rec.ev_gol is not None and rec.dep_gol is not None:
                if rec.ev_gol > rec.dep_gol:
                    sonuc = "H"
                elif rec.ev_gol < rec.dep_gol:
                    sonuc = "A"
                else:
                    sonuc = "D"
            else:
                sonuc = None

            conn.execute(text("SAVEPOINT sp_match"))
            try:
                conn.execute(text("""
                    INSERT INTO club_historical_matches
                        (tarih, lig, sezon, ev_takim, dep_takim,
                         ev_gol, dep_gol, ht_ev_gol, ht_dep_gol,
                         sonuc, kaynak)
                    VALUES
                        (:tarih, :lig, :sezon, :ev, :dep,
                         :eg, :dg, :hteg, :htdg,
                         :sonuc, :kaynak)
                    ON CONFLICT (tarih, lig, ev_takim, dep_takim) DO UPDATE SET
                        ev_gol    = COALESCE(EXCLUDED.ev_gol,    club_historical_matches.ev_gol),
                        dep_gol   = COALESCE(EXCLUDED.dep_gol,   club_historical_matches.dep_gol),
                        ht_ev_gol = COALESCE(EXCLUDED.ht_ev_gol, club_historical_matches.ht_ev_gol),
                        ht_dep_gol= COALESCE(EXCLUDED.ht_dep_gol,club_historical_matches.ht_dep_gol),
                        sonuc     = COALESCE(EXCLUDED.sonuc,     club_historical_matches.sonuc)
                """), {
                    "tarih": rec.tarih, "lig": rec.lig, "sezon": sezon_fmt,
                    "ev": rec.ev_takim, "dep": rec.dep_takim,
                    "eg": rec.ev_gol, "dg": rec.dep_gol,
                    "hteg": rec.ht_ev_gol, "htdg": rec.ht_dep_gol,
                    "sonuc": sonuc, "kaynak": rec.source,
                })
                conn.execute(text("RELEASE SAVEPOINT sp_match"))
                inserted += 1
            except Exception as exc:
                conn.execute(text("ROLLBACK TO SAVEPOINT sp_match"))
                log.debug("club_historical_matches insert hatası: %s", exc)

        return inserted

    # ── player_external_stats ─────────────────────────────────────────────────

    # Standart lig kodu → DB'deki uzun isim (mevcut veriyle uyumluluk)
    _LIG_UZUN: dict[str, str] = {
        "EPL":        "Premier League",
        "LaLiga":     "La Liga",
        "Bundesliga": "Bundesliga",
        "SerieA":     "Serie A",
        "Ligue1":     "Ligue 1",
        "UCL":        "Champions League",
        "UEL":        "Europa League",
    }

    def _write_player_stats(self, conn, records: list[PlayerStatRecord], player_cache: dict) -> int:
        """
        PlayerStatRecord'ları player_external_stats tablosuna yaz.

        Normalleştirme:
          - lig kodu ("EPL") → uzun isim ("Premier League")
          - sezon yılı ("2023") → "YYYY/YY" formatı ("2023/24")
        Unique constraint: (oyuncu_id, sezon, lig) — kaynak dahil değil.
        """
        inserted = 0
        for rec in records:
            pid = _find_player_id(conn, rec.oyuncu_isim, player_cache)
            if not pid:
                continue

            # Lig normalizasyonu
            lig_db = self._LIG_UZUN.get(rec.lig, rec.lig)

            # Sezon normalizasyonu: "2023" → "2023/24"
            sezon_db = rec.sezon
            if len(rec.sezon) == 4 and rec.sezon.isdigit():
                y = int(rec.sezon)
                sezon_db = f"{y}/{str(y+1)[-2:]}"

            # Savepoint: tek INSERT hatası tüm transaction'ı kırmasın
            conn.execute(text("SAVEPOINT sp_pstat"))
            try:
                conn.execute(text("""
                    INSERT INTO player_external_stats
                        (oyuncu_id, lig, sezon, kaynak,
                         mac_sayisi, dakika,
                         gol, asist, np_gol,
                         xg, xa, npxg,
                         sut, isabetli_sut)
                    VALUES
                        (:pid, :lig, :sezon, :kaynak,
                         :mac, :dak,
                         :gol, :asist, :npgol,
                         :xg, :xa, :npxg,
                         :sut, :isabetli)
                    ON CONFLICT (oyuncu_id, sezon, lig) DO UPDATE SET
                        kaynak       = EXCLUDED.kaynak,
                        mac_sayisi   = COALESCE(EXCLUDED.mac_sayisi,   player_external_stats.mac_sayisi),
                        dakika       = COALESCE(EXCLUDED.dakika,       player_external_stats.dakika),
                        gol          = COALESCE(EXCLUDED.gol,          player_external_stats.gol),
                        asist        = COALESCE(EXCLUDED.asist,        player_external_stats.asist),
                        np_gol       = COALESCE(EXCLUDED.np_gol,       player_external_stats.np_gol),
                        xg           = COALESCE(EXCLUDED.xg,           player_external_stats.xg),
                        xa           = COALESCE(EXCLUDED.xa,           player_external_stats.xa),
                        npxg         = COALESCE(EXCLUDED.npxg,         player_external_stats.npxg),
                        sut          = COALESCE(EXCLUDED.sut,          player_external_stats.sut),
                        isabetli_sut = COALESCE(EXCLUDED.isabetli_sut, player_external_stats.isabetli_sut)
                """), {
                    "pid":      pid,
                    "lig":      lig_db,
                    "sezon":    sezon_db,
                    "kaynak":   rec.source,
                    "mac":      rec.mac_sayisi,
                    "dak":      rec.dakika,
                    "gol":      rec.gol,
                    "asist":    rec.asist,
                    "npgol":    rec.np_gol,
                    "xg":       round(rec.xg,   4) if rec.xg   is not None else None,
                    "xa":       round(rec.xa,   4) if rec.xa   is not None else None,
                    "npxg":     round(rec.npxg, 4) if rec.npxg is not None else None,
                    "sut":      rec.sut,
                    "isabetli": rec.isabetli_sut,
                })
                conn.execute(text("RELEASE SAVEPOINT sp_pstat"))
                inserted += 1
            except Exception as exc:
                conn.execute(text("ROLLBACK TO SAVEPOINT sp_pstat"))
                log.debug("player_external_stats insert hatası: %s", exc)

        return inserted

    # ── shots ─────────────────────────────────────────────────────────────────

    def _write_shots(self, conn, records: list[ShotRecord], player_cache: dict) -> int:
        """
        ShotRecord'ları shots tablosuna yaz.
        Aynı şut (oyuncu+maç+konum) çakışmasında güncelleme yapma (INSERT OR IGNORE).
        """
        inserted = 0
        for rec in records:
            pid = _find_player_id(conn, rec.oyuncu_isim, player_cache)
            if not pid:
                continue

            # Maç ID bul
            mac_id = _find_match_id(conn, rec.mac_tarih, rec.ev_takim, rec.dep_takim, rec.lig)
            if not mac_id:
                continue

            try:
                conn.execute(text("""
                    INSERT INTO shots (oyuncu_id, mac_id, x_konum, y_konum, xg, gol_mu, dakika, period, source)
                    VALUES (:pid, :mid, :x, :y, :xg, :gol, :dak, :per, :src)
                    ON CONFLICT DO NOTHING
                """), {
                    "pid": pid, "mid": mac_id,
                    "x":   round(rec.x, 2), "y": round(rec.y, 2),
                    "xg":  round(rec.xg, 4) if rec.xg is not None else None,
                    "gol": rec.gol_mu,
                    "dak": rec.dakika,
                    "per": rec.period,
                    "src": rec.source,
                })
                inserted += 1
            except Exception:
                pass  # UNIQUE ihlali → atla

        return inserted
