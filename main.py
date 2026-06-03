#!/usr/bin/env python3
"""
main.py — Veri kaynağı orchestrator'ı
======================================

Tüm kaynakları (Understat, openfootball, football-data.org,
football-data.co.uk, StatsBomb) sırayla çalıştırır ve sonuçları
PostgreSQL'e yazar.

Kullanım:
  python main.py                            # tüm kaynaklar, tüm ligler
  python main.py --kaynak understat         # sadece Understat
  python main.py --kaynak openfootball understat  # birden fazla
  python main.py --lig EPL SerieA           # belirli ligler
  python main.py --sezon 2024               # tek sezon
  python main.py --dry-run                  # DB'ye yazma, sadece çek ve raporla
  python main.py --no-cache                 # soccerdata önbelleğini atla
  python main.py --rapor                    # mevcut veri durumunu göster

Mimari:
  sources/understat.py      → Büyük 5 ligi xG'li oyuncu istatistikleri
  sources/openfootball.py   → Süper Lig dahil kulüp ligi fikstür/sonuç
  sources/footballdata_org.py → Avrupa kupaları + Büyük 5 fikstür (API key)
  sources/footballdata_couk.py → Geçmiş sonuç CSV + H2H verisi
  sources/statsbomb.py      → WC/Euro/Copa derin metrik (xG, şut, dakika)
  sources/writer.py         → Ortak şema → PostgreSQL yazıcı

Dedup kuralı:
  - player_external_stats: (oyuncu_id, lig, sezon, kaynak) UNIQUE — kaynak başına 1 satır
  - shots: (oyuncu_id, mac_id, x_yuvarlak, y_yuvarlak) UNIQUE — aynı şut iki kayıt olmaz
  - matches: şu an sources/writer.py içinde TODO — implementasyon sırasında eklenecek
"""

import argparse
import logging
import os
import sys
from typing import Optional

from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Loglama ayarları
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
# Gürültülü kütüphaneleri sustur
for _noisy in ("soccerdata", "urllib3", "requests", "statsbombpy"):
    logging.getLogger(_noisy).setLevel(logging.WARNING)

log = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# ── Kaynak kayıt tablosu ──────────────────────────────────────────────────────
# Her giriş: (modül_adı, sınıf, varsayılan ligler, varsayılan sezonlar)
# None → kaynağın kendi available_leagues() / available_seasons() kullanılır.
KAYNAK_TANIM: dict[str, dict] = {
    "understat": {
        "module":  "sources.understat",
        "class":   "UnderstatSource",
        "ligler":  ["EPL", "LaLiga", "Bundesliga", "SerieA", "Ligue1"],
        "sezonlar": ["2023", "2024"],          # son 2 sezon
        "aciklama": "Büyük 5 ligi xG + oyuncu istatistikleri",
    },
    "openfootball": {
        "module":  "sources.openfootball",
        "class":   "OpenfootballSource",
        "ligler":  ["EPL", "LaLiga", "Bundesliga", "SerieA", "Ligue1", "SuperLig",
                    "Eredivisie", "PrimeiraLiga"],
        "sezonlar": ["2023", "2024"],
        "aciklama": "Kulüp ligleri fikstür/sonuç (Süper Lig dahil)",
    },
    "footballdata_org": {
        "module":  "sources.footballdata_org",
        "class":   "FootballDataOrgSource",
        "ligler":  ["EPL", "LaLiga", "Bundesliga", "SerieA", "Ligue1", "UCL"],
        "sezonlar": ["2023", "2024"],
        "aciklama": "Büyük 5 + Avrupa kupaları (API key gerekli)",
    },
    "footballdata_couk": {
        "module":  "sources.footballdata_couk",
        "class":   "FootballDataCoUkSource",
        "ligler":  ["EPL", "LaLiga", "Bundesliga", "SerieA", "Ligue1", "SuperLig"],
        "sezonlar": ["2021", "2022", "2023", "2024"],
        "aciklama": "Geçmiş maç sonuçları + H2H (CSV)",
    },
    "statsbomb": {
        "module":  "sources.statsbomb",
        "class":   "StatsBombSource",
        "ligler":  None,    # kendi available_leagues() kullanılır
        "sezonlar": None,   # kendi available_seasons() kullanılır
        "aciklama": "WC/Euro/Copa derin metrik (xG, şut, dakika)",
    },
}


# ── Yardımcı fonksiyonlar ─────────────────────────────────────────────────────

def _import_source(tanim: dict, dry_run: bool, cache: bool):
    """Dinamik import ile kaynak örneği oluşturur."""
    import importlib
    mod  = importlib.import_module(tanim["module"])
    cls  = getattr(mod, tanim["class"])
    return cls(dry_run=dry_run, cache=cache)


def rapor(engine) -> None:
    """Mevcut DB'deki veri doluluk durumunu gösterir."""
    print("\n" + "=" * 65)
    print("  VERİ DOLULUK RAPORU")
    print("=" * 65)

    # Turnuva bazlı maç sayısı
    print("\n  ── Maçlar (matches) ──")
    rows = engine.connect().execute(text("""
        SELECT turnuva, COUNT(*) as mac_sayisi,
               MIN(tarih)::text as ilk, MAX(tarih)::text as son
        FROM matches
        GROUP BY turnuva ORDER BY turnuva
    """)).fetchall()
    print(f"  {'Turnuva':<35} {'Maç':>5}  {'İlk':>10}  {'Son':>10}")
    print("  " + "-" * 63)
    for r in rows:
        print(f"  {str(r[0]):<35} {r[1]:>5}  {str(r[2] or '')[:10]:>10}  {str(r[3] or '')[:10]:>10}")
    print(f"\n  Toplam maç: {sum(r[1] for r in rows)}")

    # Kaynak bazlı oyuncu istatistiği
    print("\n  ── Oyuncu İstatistikleri (player_external_stats) ──")
    rows2 = engine.connect().execute(text("""
        SELECT kaynak, lig, sezon, COUNT(*) as n
        FROM player_external_stats
        GROUP BY kaynak, lig, sezon
        ORDER BY kaynak, lig, sezon
    """)).fetchall()
    if rows2:
        print(f"  {'Kaynak':<16} {'Lig':<12} {'Sezon':>6}  {'Kayıt':>6}")
        print("  " + "-" * 45)
        for r in rows2:
            print(f"  {str(r[0]):<16} {str(r[1]):<12} {str(r[2]):>6}  {r[3]:>6}")
    else:
        print("  (henüz veri yok)")

    # Şut doluluk (dakika alanı)
    print("\n  ── Şutlar (shots) ──")
    rows3 = engine.connect().execute(text("""
        SELECT m.turnuva, COUNT(*) as toplam,
               COUNT(s.dakika) as dakika_dolu,
               COUNT(*) - COUNT(s.dakika) as dakika_bos
        FROM shots s
        JOIN matches m ON m.id = s.mac_id
        GROUP BY m.turnuva ORDER BY m.turnuva
    """)).fetchall()
    if rows3:
        print(f"  {'Turnuva':<35} {'Toplam':>8} {'Dakikalı':>10} {'Eksik':>8}")
        print("  " + "-" * 65)
        for r in rows3:
            print(f"  {str(r[0]):<35} {r[1]:>8} {r[2]:>10} {r[3]:>8}")
    else:
        print("  (henüz şut verisi yok)")

    print()


# ── Ana orchestrator ──────────────────────────────────────────────────────────

def calistir(
    engine,
    kaynak_listesi: list[str],
    lig_filtresi:   Optional[list[str]],
    sezon_filtresi: Optional[list[str]],
    dry_run:        bool,
    cache:          bool,
) -> None:
    """Seçili kaynakları sırayla çalıştır, sonuçları DB'ye yaz."""
    from sources.writer import DBWriter
    writer = DBWriter(engine)

    toplam_stats = {"matches": 0, "player_stats": 0, "shots": 0, "hatalar": 0}

    for kaynak_adi in kaynak_listesi:
        if kaynak_adi not in KAYNAK_TANIM:
            log.warning("Bilinmeyen kaynak: %s — atlanıyor", kaynak_adi)
            continue

        tanim = KAYNAK_TANIM[kaynak_adi]
        log.info("\n%s\n  Kaynak: %s — %s\n%s",
                 "=" * 60, kaynak_adi.upper(), tanim["aciklama"], "=" * 60)

        try:
            src = _import_source(tanim, dry_run=dry_run, cache=cache)
        except Exception as exc:
            log.error("Kaynak yüklenemedi (%s): %s", kaynak_adi, exc)
            continue

        # Lig ve sezon belirle
        ligler  = lig_filtresi  or tanim.get("ligler")  or src.available_leagues()
        sezonlar = sezon_filtresi or tanim.get("sezonlar") or src.available_seasons(ligler[0] if ligler else "")

        results = src.fetch_all(leagues=ligler, seasons=sezonlar)

        if not dry_run:
            stats = writer.write(results)
            for k in toplam_stats:
                toplam_stats[k] += stats.get(k, 0)
            log.info(
                "[%s] yazıldı → matches+%d player_stats+%d shots+%d hatalar:%d",
                kaynak_adi, stats["matches"], stats["player_stats"],
                stats["shots"], stats["hatalar"],
            )
        else:
            rec_sayisi = sum(r.toplam for r in results)
            log.info("[%s] DRY-RUN — toplam %d kayıt çekildi, DB'ye yazılmadı", kaynak_adi, rec_sayisi)

    if not dry_run:
        log.info(
            "\n  ── TOPLAM ──\n"
            "  matches:      %d\n"
            "  player_stats: %d\n"
            "  shots:        %d\n"
            "  hatalar:      %d",
            toplam_stats["matches"], toplam_stats["player_stats"],
            toplam_stats["shots"],   toplam_stats["hatalar"],
        )


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="HüCem Hattı — Çoklu kaynak veri orchestrator'ı",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="\n".join([
            "Kaynaklar:",
            *[f"  {k:<20} {v['aciklama']}" for k, v in KAYNAK_TANIM.items()],
        ]),
    )
    parser.add_argument(
        "--kaynak", nargs="+", metavar="AD",
        help=f"Çalıştırılacak kaynaklar: {', '.join(KAYNAK_TANIM)}",
    )
    parser.add_argument("--lig",    nargs="+", metavar="KOD", help="Lig filtresi (örn. EPL LaLiga)")
    parser.add_argument("--sezon",  nargs="+", metavar="YIL", help="Sezon filtresi (örn. 2023 2024)")
    parser.add_argument("--dry-run",  action="store_true", help="DB'ye yazma, sadece raporla")
    parser.add_argument("--no-cache", action="store_true", help="soccerdata önbelleğini atla")
    parser.add_argument("--rapor",    action="store_true", help="Mevcut veri durumunu göster")
    parser.add_argument("--liste",    action="store_true", help="Kaynak listesini göster ve çık")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.liste:
        print("\nKullanılabilir kaynaklar:")
        for k, v in KAYNAK_TANIM.items():
            ligler = v["ligler"] or ["(kaynak tanımlı)"]
            print(f"  {k:<20} {v['aciklama']}")
            print(f"  {'':20} Ligler:  {', '.join(ligler) if ligler else 'tümü'}")
            print(f"  {'':20} Sezonlar: {', '.join(v['sezonlar'] or ['tümü'])}\n")
        return

    if args.rapor:
        rapor(engine)
        return

    kaynak_listesi = args.kaynak or list(KAYNAK_TANIM.keys())

    calistir(
        engine         = engine,
        kaynak_listesi = kaynak_listesi,
        lig_filtresi   = args.lig,
        sezon_filtresi = args.sezon,
        dry_run        = args.dry_run,
        cache          = not args.no_cache,
    )


if __name__ == "__main__":
    main()
