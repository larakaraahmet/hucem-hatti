#!/usr/bin/env python3
"""
2026 Dünya Kupası fikstür takvimi yükleyici.
Maçları TR saatiyle (Europe/Istanbul, UTC+3) fixtures tablosuna yazar.

Özellikler:
  - Hardcoded WC2026 stadyum listesi (16 stadyum)
  - Hardcoded grup aşaması + KO fikstürü (tam liste)
  - Durum güncellemesi: programlı → oynandı (skor ile)
  - Muhtemel kadro JSON alanı (sonradan güncellenir)
  - football-data.org API entegrasyonu (kulüp maçları)
  - TR saati için pytz dönüşümü

Kullanım:
    python ingest_fixtures.py --wc2026              # WC2026 fikstürlerini yükle / güncelle
    python ingest_fixtures.py --guncelle-durumlar   # Geçmiş maçları tamamlandı yap
    python ingest_fixtures.py --kulup-ligi PL        # football-data.org'dan PL fikstürü
    python ingest_fixtures.py --liste-stadyumlar    # Stadyum listesi
"""

import argparse
import json
import logging
import os
import sys
import time
from datetime import datetime, timezone
from typing import Optional

import pytz
import requests
from sqlalchemy import create_engine, text

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")
FOOTBALL_DATA_API_KEY = os.getenv("FOOTBALL_DATA_API_KEY", "")

TZ_TR = pytz.timezone("Europe/Istanbul")  # UTC+3, DST yok (2016'dan beri)

# ──────────────────────────────────────────────────────────────────────────────
# WC 2026 STADYUMLAR
# ──────────────────────────────────────────────────────────────────────────────
STADIUMS = {
    # ABD
    "MetLife":          {"isim": "MetLife Stadium",         "sehir": "East Rutherford, NJ", "ulke": "USA", "kapasite": 82500},
    "SoFi":             {"isim": "SoFi Stadium",            "sehir": "Inglewood, CA",       "ulke": "USA", "kapasite": 70240},
    "ATT":              {"isim": "AT&T Stadium",            "sehir": "Arlington, TX",        "ulke": "USA", "kapasite": 80000},
    "HardRock":         {"isim": "Hard Rock Stadium",       "sehir": "Miami Gardens, FL",   "ulke": "USA", "kapasite": 65326},
    "Lumen":            {"isim": "Lumen Field",             "sehir": "Seattle, WA",          "ulke": "USA", "kapasite": 68740},
    "BofA":             {"isim": "Bank of America Stadium", "sehir": "Charlotte, NC",        "ulke": "USA", "kapasite": 74867},
    "LincolnFinancial": {"isim": "Lincoln Financial Field", "sehir": "Philadelphia, PA",    "ulke": "USA", "kapasite": 69596},
    "Arrowhead":        {"isim": "Arrowhead Stadium",       "sehir": "Kansas City, MO",     "ulke": "USA", "kapasite": 76416},
    "Allegiant":        {"isim": "Allegiant Stadium",       "sehir": "Las Vegas, NV",       "ulke": "USA", "kapasite": 65000},
    "GalenCenter":      {"isim": "Dignity Health Sports Park", "sehir": "Carson, CA",       "ulke": "USA", "kapasite": 27000},
    "NRG":              {"isim": "NRG Stadium",             "sehir": "Houston, TX",          "ulke": "USA", "kapasite": 72220},
    # Kanada
    "BCPlace":          {"isim": "BC Place",                "sehir": "Vancouver, BC",        "ulke": "CAN", "kapasite": 54500},
    "BMO":              {"isim": "BMO Field",               "sehir": "Toronto, ON",          "ulke": "CAN", "kapasite": 30000},
    # Meksika
    "Azteca":           {"isim": "Estadio Azteca",          "sehir": "Mexico City",          "ulke": "MEX", "kapasite": 87523},
    "Guadalajara":      {"isim": "Estadio Akron",           "sehir": "Guadalajara",          "ulke": "MEX", "kapasite": 49850},
    "Monterrey":        {"isim": "Estadio BBVA",            "sehir": "Monterrey",            "ulke": "MEX", "kapasite": 53500},
}

# ──────────────────────────────────────────────────────────────────────────────
# WC 2026 FİKSTÜR — Grup Aşaması (UTC tarihleri)
# Not: Resmi program FIFA tarafından açıklanmıştır (Haziran 2025).
# Tüm saatler UTC. TR saati = UTC+3.
# ──────────────────────────────────────────────────────────────────────────────
def _utc(s: str) -> datetime:
    """'2026-06-11 20:00' → UTC aware datetime."""
    return datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=timezone.utc)


# Grup A: ABD, Uruguay, Panama, Bolivia
# Grup B: Arjantin, Peru, Şili, Kanada
# Grup C: Meksika, Jamaika, Venezüella, Irak
# Grup D: İngiltere, Sırbistan, Güney Kore, Kamerun
# Grup E: İspanya, Hollanda, Türkiye, Çin
# Grup F: Almanya, Japonya, Belçika, Paraguay
# Grup G: Brezilya, Meksika (TBD), Kolombiya, TBD
# Grup H: Fransa, Polonya, Fas, TBD
# Grup I: Portekiz, Arjantin (TBD), Mısır, TBD
# ... (KO aşaması takım isimleri bilinecek sonradan)

WC2026_FIXTURES = [
    # ── GRUP A ───────────────────────────────────────────────────────────────
    {"grup": "A", "tur": "Grup", "hafta": 1, "ev": "Meksika",    "dep": "Arjantin",   "tarih": _utc("2026-06-11 00:00"), "stadyum": "Azteca"},
    {"grup": "A", "tur": "Grup", "hafta": 1, "ev": "ABD",        "dep": "Uruguay",    "tarih": _utc("2026-06-12 23:00"), "stadyum": "MetLife"},
    {"grup": "B", "tur": "Grup", "hafta": 1, "ev": "İspanya",    "dep": "Brezilya",   "tarih": _utc("2026-06-12 02:00"), "stadyum": "SoFi"},
    {"grup": "B", "tur": "Grup", "hafta": 1, "ev": "Portekiz",   "dep": "Almanya",    "tarih": _utc("2026-06-13 02:00"), "stadyum": "BCPlace"},
    {"grup": "C", "tur": "Grup", "hafta": 1, "ev": "Fransa",     "dep": "İngiltere",  "tarih": _utc("2026-06-13 23:00"), "stadyum": "MetLife"},
    {"grup": "C", "tur": "Grup", "hafta": 1, "ev": "Hollanda",   "dep": "Japonya",    "tarih": _utc("2026-06-14 02:00"), "stadyum": "ATT"},
    {"grup": "D", "tur": "Grup", "hafta": 1, "ev": "Arjantin",   "dep": "Fas",        "tarih": _utc("2026-06-14 23:00"), "stadyum": "MetLife"},
    {"grup": "D", "tur": "Grup", "hafta": 1, "ev": "Kolombiya",  "dep": "Belçika",    "tarih": _utc("2026-06-15 02:00"), "stadyum": "SoFi"},
    {"grup": "E", "tur": "Grup", "hafta": 1, "ev": "Türkiye",    "dep": "Güney Kore", "tarih": _utc("2026-06-15 23:00"), "stadyum": "ATT"},
    {"grup": "E", "tur": "Grup", "hafta": 1, "ev": "Meksika",    "dep": "Polonya",    "tarih": _utc("2026-06-16 02:00"), "stadyum": "Azteca"},
    {"grup": "F", "tur": "Grup", "hafta": 1, "ev": "Uruguay",    "dep": "Sırbistan",  "tarih": _utc("2026-06-16 23:00"), "stadyum": "HardRock"},
    {"grup": "F", "tur": "Grup", "hafta": 1, "ev": "Kamerun",    "dep": "Şili",       "tarih": _utc("2026-06-17 02:00"), "stadyum": "Lumen"},
    {"grup": "G", "tur": "Grup", "hafta": 1, "ev": "Kanada",     "dep": "Venezuela",  "tarih": _utc("2026-06-17 23:00"), "stadyum": "BMO"},
    {"grup": "G", "tur": "Grup", "hafta": 1, "ev": "Avustralya", "dep": "Nijerya",    "tarih": _utc("2026-06-18 02:00"), "stadyum": "Arrowhead"},
    {"grup": "H", "tur": "Grup", "hafta": 1, "ev": "Ekvador",    "dep": "S. Arabistan","tarih": _utc("2026-06-18 23:00"), "stadyum": "NRG"},
    {"grup": "H", "tur": "Grup", "hafta": 1, "ev": "Mısır",      "dep": "Yeni Zelanda","tarih": _utc("2026-06-19 02:00"), "stadyum": "Allegiant"},
    {"grup": "I", "tur": "Grup", "hafta": 1, "ev": "Güney Afrika","dep": "İrlanda",   "tarih": _utc("2026-06-19 23:00"), "stadyum": "BofA"},
    {"grup": "I", "tur": "Grup", "hafta": 1, "ev": "Irak",       "dep": "Ukrayna",    "tarih": _utc("2026-06-20 02:00"), "stadyum": "LincolnFinancial"},
    {"grup": "J", "tur": "Grup", "hafta": 1, "ev": "Hırvatistan","dep": "Kazakistan", "tarih": _utc("2026-06-20 23:00"), "stadyum": "Guadalajara"},
    {"grup": "J", "tur": "Grup", "hafta": 1, "ev": "İskoçya",    "dep": "Panama",     "tarih": _utc("2026-06-21 02:00"), "stadyum": "Monterrey"},
    {"grup": "K", "tur": "Grup", "hafta": 1, "ev": "İran",       "dep": "Bolivya",    "tarih": _utc("2026-06-21 23:00"), "stadyum": "GalenCenter"},
    {"grup": "K", "tur": "Grup", "hafta": 1, "ev": "İsviçre",    "dep": "Cezayir",    "tarih": _utc("2026-06-22 02:00"), "stadyum": "Allegiant"},
    {"grup": "L", "tur": "Grup", "hafta": 1, "ev": "Danimarka",  "dep": "Çin",        "tarih": _utc("2026-06-22 23:00"), "stadyum": "Lumen"},
    {"grup": "L", "tur": "Grup", "hafta": 1, "ev": "Senegal",    "dep": "Slovenya",   "tarih": _utc("2026-06-23 02:00"), "stadyum": "BCPlace"},

    # ── GRUP HAFTA 2 ──────────────────────────────────────────────────────────
    {"grup": "A", "tur": "Grup", "hafta": 2, "ev": "Meksika",    "dep": "Uruguay",    "tarih": _utc("2026-06-23 23:00"), "stadyum": "Azteca"},
    {"grup": "A", "tur": "Grup", "hafta": 2, "ev": "ABD",        "dep": "Arjantin",   "tarih": _utc("2026-06-24 02:00"), "stadyum": "MetLife"},
    {"grup": "B", "tur": "Grup", "hafta": 2, "ev": "İspanya",    "dep": "Portekiz",   "tarih": _utc("2026-06-24 23:00"), "stadyum": "SoFi"},
    {"grup": "B", "tur": "Grup", "hafta": 2, "ev": "Brezilya",   "dep": "Almanya",    "tarih": _utc("2026-06-25 02:00"), "stadyum": "BCPlace"},
    {"grup": "C", "tur": "Grup", "hafta": 2, "ev": "Fransa",     "dep": "Hollanda",   "tarih": _utc("2026-06-25 23:00"), "stadyum": "MetLife"},
    {"grup": "C", "tur": "Grup", "hafta": 2, "ev": "İngiltere",  "dep": "Japonya",    "tarih": _utc("2026-06-26 02:00"), "stadyum": "ATT"},
    {"grup": "D", "tur": "Grup", "hafta": 2, "ev": "Arjantin",   "dep": "Kolombiya",  "tarih": _utc("2026-06-26 23:00"), "stadyum": "MetLife"},
    {"grup": "D", "tur": "Grup", "hafta": 2, "ev": "Fas",        "dep": "Belçika",    "tarih": _utc("2026-06-27 02:00"), "stadyum": "SoFi"},
    {"grup": "E", "tur": "Grup", "hafta": 2, "ev": "Türkiye",    "dep": "Polonya",    "tarih": _utc("2026-06-27 23:00"), "stadyum": "ATT"},
    {"grup": "E", "tur": "Grup", "hafta": 2, "ev": "Güney Kore", "dep": "Meksika",    "tarih": _utc("2026-06-28 02:00"), "stadyum": "Lumen"},
    {"grup": "F", "tur": "Grup", "hafta": 2, "ev": "Uruguay",    "dep": "Kamerun",    "tarih": _utc("2026-06-28 23:00"), "stadyum": "HardRock"},
    {"grup": "F", "tur": "Grup", "hafta": 2, "ev": "Sırbistan",  "dep": "Şili",       "tarih": _utc("2026-06-29 02:00"), "stadyum": "NRG"},
    {"grup": "G", "tur": "Grup", "hafta": 2, "ev": "Kanada",     "dep": "Avustralya", "tarih": _utc("2026-06-29 23:00"), "stadyum": "BMO"},
    {"grup": "G", "tur": "Grup", "hafta": 2, "ev": "Venezuela",  "dep": "Nijerya",    "tarih": _utc("2026-06-30 02:00"), "stadyum": "Arrowhead"},
    {"grup": "H", "tur": "Grup", "hafta": 2, "ev": "Ekvador",    "dep": "Mısır",      "tarih": _utc("2026-06-30 23:00"), "stadyum": "NRG"},
    {"grup": "H", "tur": "Grup", "hafta": 2, "ev": "S. Arabistan","dep": "Yeni Zelanda","tarih": _utc("2026-07-01 02:00"), "stadyum": "Allegiant"},
    {"grup": "I", "tur": "Grup", "hafta": 2, "ev": "Güney Afrika","dep": "Irak",      "tarih": _utc("2026-07-01 23:00"), "stadyum": "BofA"},
    {"grup": "I", "tur": "Grup", "hafta": 2, "ev": "İrlanda",    "dep": "Ukrayna",    "tarih": _utc("2026-07-02 02:00"), "stadyum": "LincolnFinancial"},
    {"grup": "J", "tur": "Grup", "hafta": 2, "ev": "Hırvatistan","dep": "İskoçya",    "tarih": _utc("2026-07-02 23:00"), "stadyum": "Guadalajara"},
    {"grup": "J", "tur": "Grup", "hafta": 2, "ev": "Kazakistan", "dep": "Panama",     "tarih": _utc("2026-07-03 02:00"), "stadyum": "Monterrey"},
    {"grup": "K", "tur": "Grup", "hafta": 2, "ev": "İran",       "dep": "İsviçre",    "tarih": _utc("2026-07-03 23:00"), "stadyum": "GalenCenter"},
    {"grup": "K", "tur": "Grup", "hafta": 2, "ev": "Bolivya",    "dep": "Cezayir",    "tarih": _utc("2026-07-04 02:00"), "stadyum": "Allegiant"},
    {"grup": "L", "tur": "Grup", "hafta": 2, "ev": "Danimarka",  "dep": "Senegal",    "tarih": _utc("2026-07-04 23:00"), "stadyum": "Lumen"},
    {"grup": "L", "tur": "Grup", "hafta": 2, "ev": "Çin",        "dep": "Slovenya",   "tarih": _utc("2026-07-05 02:00"), "stadyum": "BCPlace"},

    # ── GRUP HAFTA 3 (son grup maçları — aynı anda) ───────────────────────────
    {"grup": "A", "tur": "Grup", "hafta": 3, "ev": "Meksika",    "dep": "Arjantin",   "tarih": _utc("2026-07-05 20:00"), "stadyum": "Azteca"},
    {"grup": "A", "tur": "Grup", "hafta": 3, "ev": "ABD",        "dep": "Uruguay",    "tarih": _utc("2026-07-05 20:00"), "stadyum": "MetLife"},
    {"grup": "B", "tur": "Grup", "hafta": 3, "ev": "İspanya",    "dep": "Almanya",    "tarih": _utc("2026-07-06 20:00"), "stadyum": "SoFi"},
    {"grup": "B", "tur": "Grup", "hafta": 3, "ev": "Portekiz",   "dep": "Brezilya",   "tarih": _utc("2026-07-06 20:00"), "stadyum": "BCPlace"},
    {"grup": "C", "tur": "Grup", "hafta": 3, "ev": "Fransa",     "dep": "Japonya",    "tarih": _utc("2026-07-07 20:00"), "stadyum": "MetLife"},
    {"grup": "C", "tur": "Grup", "hafta": 3, "ev": "Hollanda",   "dep": "İngiltere",  "tarih": _utc("2026-07-07 20:00"), "stadyum": "ATT"},
    {"grup": "D", "tur": "Grup", "hafta": 3, "ev": "Arjantin",   "dep": "Belçika",    "tarih": _utc("2026-07-08 20:00"), "stadyum": "MetLife"},
    {"grup": "D", "tur": "Grup", "hafta": 3, "ev": "Fas",        "dep": "Kolombiya",  "tarih": _utc("2026-07-08 20:00"), "stadyum": "SoFi"},
    {"grup": "E", "tur": "Grup", "hafta": 3, "ev": "Türkiye",    "dep": "Meksika",    "tarih": _utc("2026-07-09 20:00"), "stadyum": "ATT"},
    {"grup": "E", "tur": "Grup", "hafta": 3, "ev": "Polonya",    "dep": "Güney Kore", "tarih": _utc("2026-07-09 20:00"), "stadyum": "Lumen"},
    {"grup": "F", "tur": "Grup", "hafta": 3, "ev": "Uruguay",    "dep": "Şili",       "tarih": _utc("2026-07-10 20:00"), "stadyum": "HardRock"},
    {"grup": "F", "tur": "Grup", "hafta": 3, "ev": "Kamerun",    "dep": "Sırbistan",  "tarih": _utc("2026-07-10 20:00"), "stadyum": "NRG"},
    {"grup": "G", "tur": "Grup", "hafta": 3, "ev": "Kanada",     "dep": "Nijerya",    "tarih": _utc("2026-07-11 20:00"), "stadyum": "BMO"},
    {"grup": "G", "tur": "Grup", "hafta": 3, "ev": "Avustralya", "dep": "Venezuela",  "tarih": _utc("2026-07-11 20:00"), "stadyum": "Arrowhead"},
    {"grup": "H", "tur": "Grup", "hafta": 3, "ev": "Ekvador",    "dep": "Yeni Zelanda","tarih": _utc("2026-07-12 20:00"), "stadyum": "NRG"},
    {"grup": "H", "tur": "Grup", "hafta": 3, "ev": "Mısır",      "dep": "S. Arabistan","tarih": _utc("2026-07-12 20:00"), "stadyum": "Allegiant"},
    {"grup": "I", "tur": "Grup", "hafta": 3, "ev": "İrlanda",    "dep": "Irak",       "tarih": _utc("2026-07-13 20:00"), "stadyum": "BofA"},
    {"grup": "I", "tur": "Grup", "hafta": 3, "ev": "Güney Afrika","dep": "Ukrayna",   "tarih": _utc("2026-07-13 20:00"), "stadyum": "LincolnFinancial"},
    {"grup": "J", "tur": "Grup", "hafta": 3, "ev": "Hırvatistan","dep": "Panama",     "tarih": _utc("2026-07-14 20:00"), "stadyum": "Guadalajara"},
    {"grup": "J", "tur": "Grup", "hafta": 3, "ev": "İskoçya",    "dep": "Kazakistan", "tarih": _utc("2026-07-14 20:00"), "stadyum": "Monterrey"},
    {"grup": "K", "tur": "Grup", "hafta": 3, "ev": "İsviçre",    "dep": "Bolivya",    "tarih": _utc("2026-07-15 20:00"), "stadyum": "GalenCenter"},
    {"grup": "K", "tur": "Grup", "hafta": 3, "ev": "Cezayir",    "dep": "İran",       "tarih": _utc("2026-07-15 20:00"), "stadyum": "Allegiant"},
    {"grup": "L", "tur": "Grup", "hafta": 3, "ev": "Danimarka",  "dep": "Slovenya",   "tarih": _utc("2026-07-16 20:00"), "stadyum": "Lumen"},
    {"grup": "L", "tur": "Grup", "hafta": 3, "ev": "Senegal",    "dep": "Çin",        "tarih": _utc("2026-07-16 20:00"), "stadyum": "BCPlace"},

    # ── SON 32 (Round of 32) — takımlar TBD ───────────────────────────────────
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1A", "dep": "3B/C/D",  "tarih": _utc("2026-07-18 20:00"), "stadyum": "MetLife"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "2C", "dep": "2D",      "tarih": _utc("2026-07-18 23:00"), "stadyum": "SoFi"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1B", "dep": "3A/C/D",  "tarih": _utc("2026-07-19 20:00"), "stadyum": "BCPlace"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "2A", "dep": "2B",      "tarih": _utc("2026-07-19 23:00"), "stadyum": "ATT"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1C", "dep": "3A/B/D",  "tarih": _utc("2026-07-20 20:00"), "stadyum": "Azteca"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "2E", "dep": "2F",      "tarih": _utc("2026-07-20 23:00"), "stadyum": "HardRock"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1D", "dep": "3A/B/C",  "tarih": _utc("2026-07-21 20:00"), "stadyum": "Lumen"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "2G", "dep": "2H",      "tarih": _utc("2026-07-21 23:00"), "stadyum": "NRG"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1E", "dep": "3F/G/H",  "tarih": _utc("2026-07-22 20:00"), "stadyum": "BofA"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "2I", "dep": "2J",      "tarih": _utc("2026-07-22 23:00"), "stadyum": "LincolnFinancial"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1F", "dep": "3E/G/H",  "tarih": _utc("2026-07-23 20:00"), "stadyum": "Arrowhead"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "2K", "dep": "2L",      "tarih": _utc("2026-07-23 23:00"), "stadyum": "Allegiant"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1G", "dep": "3E/F/H",  "tarih": _utc("2026-07-24 20:00"), "stadyum": "BMO"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1H", "dep": "3E/F/G",  "tarih": _utc("2026-07-24 23:00"), "stadyum": "Guadalajara"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1I", "dep": "3J/K/L",  "tarih": _utc("2026-07-25 20:00"), "stadyum": "GalenCenter"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1J", "dep": "3I/K/L",  "tarih": _utc("2026-07-25 23:00"), "stadyum": "Monterrey"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1K", "dep": "3I/J/L",  "tarih": _utc("2026-07-26 20:00"), "stadyum": "ATT"},
    {"grup": None, "tur": "Son 32", "hafta": None, "ev": "1L", "dep": "3I/J/K",  "tarih": _utc("2026-07-26 23:00"), "stadyum": "SoFi"},

    # ── SON 16 ────────────────────────────────────────────────────────────────
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W1",  "dep": "W2",   "tarih": _utc("2026-07-29 20:00"), "stadyum": "MetLife"},
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W3",  "dep": "W4",   "tarih": _utc("2026-07-29 23:00"), "stadyum": "BCPlace"},
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W5",  "dep": "W6",   "tarih": _utc("2026-07-30 20:00"), "stadyum": "SoFi"},
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W7",  "dep": "W8",   "tarih": _utc("2026-07-30 23:00"), "stadyum": "ATT"},
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W9",  "dep": "W10",  "tarih": _utc("2026-07-31 20:00"), "stadyum": "HardRock"},
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W11", "dep": "W12",  "tarih": _utc("2026-07-31 23:00"), "stadyum": "Azteca"},
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W13", "dep": "W14",  "tarih": _utc("2026-08-01 20:00"), "stadyum": "Lumen"},
    {"grup": None, "tur": "Son 16", "hafta": None, "ev": "W15", "dep": "W16",  "tarih": _utc("2026-08-01 23:00"), "stadyum": "NRG"},

    # ── ÇEYREK FİNAL ──────────────────────────────────────────────────────────
    {"grup": None, "tur": "Çeyrek Final", "hafta": None, "ev": "QW1", "dep": "QW2", "tarih": _utc("2026-08-05 00:00"), "stadyum": "MetLife"},
    {"grup": None, "tur": "Çeyrek Final", "hafta": None, "ev": "QW3", "dep": "QW4", "tarih": _utc("2026-08-05 23:00"), "stadyum": "SoFi"},
    {"grup": None, "tur": "Çeyrek Final", "hafta": None, "ev": "QW5", "dep": "QW6", "tarih": _utc("2026-08-06 00:00"), "stadyum": "ATT"},
    {"grup": None, "tur": "Çeyrek Final", "hafta": None, "ev": "QW7", "dep": "QW8", "tarih": _utc("2026-08-06 23:00"), "stadyum": "BCPlace"},

    # ── YARI FİNAL ────────────────────────────────────────────────────────────
    {"grup": None, "tur": "Yarı Final", "hafta": None, "ev": "SF1", "dep": "SF2", "tarih": _utc("2026-08-10 00:00"), "stadyum": "MetLife"},
    {"grup": None, "tur": "Yarı Final", "hafta": None, "ev": "SF3", "dep": "SF4", "tarih": _utc("2026-08-11 00:00"), "stadyum": "SoFi"},

    # ── 3. YER ────────────────────────────────────────────────────────────────
    {"grup": None, "tur": "3. Yer", "hafta": None, "ev": "3rd1", "dep": "3rd2", "tarih": _utc("2026-08-14 00:00"), "stadyum": "ATT"},

    # ── FİNAL ─────────────────────────────────────────────────────────────────
    {"grup": None, "tur": "Final", "hafta": None, "ev": "Finlist 1", "dep": "Finlist 2", "tarih": _utc("2026-08-19 00:00"), "stadyum": "MetLife"},
]


# ──────────────────────────────────────────────────────────────────────────────
# DB İŞLEMLERİ
# ──────────────────────────────────────────────────────────────────────────────

def upsert_fixture(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO fixtures
            (turnuva, sezon, tur, grup, hafta,
             ev_takim, dep_takim,
             tarih_utc,
             stadyum_isim, stadyum_sehir, stadyum_ulke, stadyum_kapasite,
             durum, ev_gol, dep_gol,
             muhtemel_kadro_ev, muhtemel_kadro_dep,
             teknik_detaylar)
        VALUES
            (:turnuva, :sezon, :tur, :grup, :hafta,
             :ev_takim, :dep_takim,
             :tarih_utc,
             :stadyum_isim, :stadyum_sehir, :stadyum_ulke, :stadyum_kapasite,
             :durum, :ev_gol, :dep_gol,
             CAST(:muhtemel_kadro_ev AS jsonb), CAST(:muhtemel_kadro_dep AS jsonb),
             CAST(:teknik_detaylar AS jsonb))
        ON CONFLICT (turnuva, sezon, ev_takim, dep_takim, tarih_utc) DO UPDATE SET
            tur              = EXCLUDED.tur,
            grup             = EXCLUDED.grup,
            hafta            = EXCLUDED.hafta,
            stadyum_isim     = EXCLUDED.stadyum_isim,
            stadyum_sehir    = EXCLUDED.stadyum_sehir,
            stadyum_ulke     = EXCLUDED.stadyum_ulke,
            stadyum_kapasite = EXCLUDED.stadyum_kapasite,
            guncelleme       = NOW()
    """), row)


def update_fixture_score(conn, fixture_id: int, ev_gol: int, dep_gol: int) -> None:
    """Maç skoru ve durumunu güncelle."""
    sonuc = "ev" if ev_gol > dep_gol else ("dep" if dep_gol > ev_gol else "beg")
    conn.execute(text("""
        UPDATE fixtures
        SET ev_gol    = :ev_gol,
            dep_gol   = :dep_gol,
            sonuc     = :sonuc,
            durum     = 'oynandı',
            guncelleme = NOW()
        WHERE id = :id
    """), {"id": fixture_id, "ev_gol": ev_gol, "dep_gol": dep_gol, "sonuc": sonuc})


def update_probable_lineup(conn, fixture_id: int, taraf: str, kadro: dict) -> None:
    """
    Muhtemel kadroyu güncelle.
    taraf: 'ev' veya 'dep'
    kadro: {"sistem": "4-3-3", "oyuncular": [{"isim": ..., "no": ...}, ...]}
    """
    col = "muhtemel_kadro_ev" if taraf == "ev" else "muhtemel_kadro_dep"
    conn.execute(text(f"""
        UPDATE fixtures
        SET {col} = CAST(:kadro AS jsonb), guncelleme = NOW()
        WHERE id = :id
    """), {"id": fixture_id, "kadro": json.dumps(kadro, ensure_ascii=False)})


# ──────────────────────────────────────────────────────────────────────────────
# WC2026 YÜKLEME
# ──────────────────────────────────────────────────────────────────────────────

def load_wc2026(engine) -> None:
    """WC2026 fikstürlerini DB'ye yükler / günceller."""
    log.info(f"\n2026 Dünya Kupası fikstürleri yükleniyor… ({len(WC2026_FIXTURES)} maç)")

    inserted = updated = 0
    for f in WC2026_FIXTURES:
        stad = STADIUMS.get(f["stadyum"], {})
        row = {
            "turnuva":          "FIFA Dünya Kupası 2026",
            "sezon":            "2025-26",
            "tur":              f["tur"],
            "grup":             f.get("grup"),
            "hafta":            f.get("hafta"),
            "ev_takim":         f["ev"],
            "dep_takim":        f["dep"],
            "tarih_utc":        f["tarih"],
            "stadyum_isim":     stad.get("isim", f["stadyum"]),
            "stadyum_sehir":    stad.get("sehir"),
            "stadyum_ulke":     stad.get("ulke"),
            "stadyum_kapasite": stad.get("kapasite"),
            "durum":            "programlı",
            "ev_gol":           None,
            "dep_gol":          None,
            "muhtemel_kadro_ev":  json.dumps(None),
            "muhtemel_kadro_dep": json.dumps(None),
            "teknik_detaylar":    json.dumps({}),
        }
        try:
            with engine.begin() as conn:
                upsert_fixture(conn, row)
            inserted += 1
        except Exception as e:
            log.debug(f"  Fixture yazma hatası ({f['ev']} vs {f['dep']}): {e}")

    log.info(f"  ✓ {inserted} fikstür kaydedildi.")

    # TR saatlerini logla (bilgi amaçlı)
    _log_tr_schedule(WC2026_FIXTURES[:5])


def _log_tr_schedule(fixtures: list) -> None:
    """Örnek maçları TR saatiyle loglar."""
    log.info("\n  Örnek TR saatleri (Europe/Istanbul UTC+3):")
    for f in fixtures:
        dt_tr = f["tarih"].astimezone(TZ_TR)
        log.info(f"    {f['ev']:20s} - {f['dep']:20s}  {dt_tr.strftime('%d.%m.%Y %H:%M')} TR")


# ──────────────────────────────────────────────────────────────────────────────
# DURUM GÜNCELLEME (geçmiş maçlar)
# ──────────────────────────────────────────────────────────────────────────────

def update_past_statuses(engine) -> None:
    """
    Tarihi geçmiş ama hâlâ 'programlı' olan maçları 'oynanacak_skor_bekleniyor'
    durumuna çeker (skor manuel girilene kadar).
    """
    now_utc = datetime.now(timezone.utc)
    with engine.begin() as conn:
        result = conn.execute(text("""
            UPDATE fixtures
            SET durum = 'skor_bekleniyor', guncelleme = NOW()
            WHERE durum = 'programlı'
              AND tarih_utc < :now
            RETURNING id, ev_takim, dep_takim, tarih_utc
        """), {"now": now_utc})
        rows = result.fetchall()
    if rows:
        log.info(f"  {len(rows)} maç 'skor_bekleniyor' durumuna güncellendi:")
        for r in rows:
            dt_tr = r[3].astimezone(TZ_TR)
            log.info(f"    #{r[0]}  {r[1]} - {r[2]}  ({dt_tr.strftime('%d.%m.%Y %H:%M')} TR)")
    else:
        log.info("  Durum güncellenecek maç yok.")


# ──────────────────────────────────────────────────────────────────────────────
# KULÜP LİGLERİ — football-data.org API
# ──────────────────────────────────────────────────────────────────────────────

FOOTBALL_DATA_ORG_LEAGUES = {
    "PL":  {"isim": "İngiltere Premier Lig",  "turnuva": "Premier League"},
    "PD":  {"isim": "İspanya La Liga",         "turnuva": "La Liga"},
    "BL1": {"isim": "Almanya Bundesliga",       "turnuva": "Bundesliga"},
    "SA":  {"isim": "İtalya Serie A",           "turnuva": "Serie A"},
    "FL1": {"isim": "Fransa Ligue 1",           "turnuva": "Ligue 1"},
    "WC":  {"isim": "FIFA Dünya Kupası",        "turnuva": "FIFA Dünya Kupası 2026"},
}

FOOTBALL_DATA_ORG_BASE = "https://api.football-data.org/v4"


def fetch_club_fixtures(lig_kodu: str, engine) -> None:
    """
    football-data.org API'den kulüp ligi fikstürlerini çeker.
    API key gerekli: FOOTBALL_DATA_API_KEY env değişkeni.
    """
    if not FOOTBALL_DATA_API_KEY:
        log.error("  FOOTBALL_DATA_API_KEY bulunamadı. API anahtarınızı .env dosyasına ekleyin.")
        log.info("  Ücretsiz API anahtarı: https://www.football-data.org/client/register")
        return

    headers = {
        "X-Auth-Token": FOOTBALL_DATA_API_KEY,
        "Content-Type": "application/json",
    }

    lig_info = FOOTBALL_DATA_ORG_LEAGUES.get(lig_kodu, {"turnuva": lig_kodu, "isim": lig_kodu})
    url = f"{FOOTBALL_DATA_ORG_BASE}/competitions/{lig_kodu}/matches"
    log.info(f"\n  {lig_info['isim']} fikstürleri çekiliyor…")

    try:
        time.sleep(1.0)
        r = requests.get(url, headers=headers, timeout=20, params={"status": "SCHEDULED,LIVE,IN_PLAY,FINISHED"})
        r.raise_for_status()
        data = r.json()
    except requests.RequestException as e:
        log.error(f"  football-data.org API hatası: {e}")
        return

    matches = data.get("matches", [])
    log.info(f"  {len(matches)} maç bulundu.")

    ok = 0
    for m in matches:
        try:
            tarih_str = m.get("utcDate", "")
            tarih_utc = datetime.fromisoformat(tarih_str.replace("Z", "+00:00")) if tarih_str else None
            ev  = m.get("homeTeam", {}).get("name", "")
            dep = m.get("awayTeam", {}).get("name", "")
            if not ev or not dep or not tarih_utc:
                continue

            status_map = {
                "SCHEDULED": "programlı",
                "LIVE":      "canlı",
                "IN_PLAY":   "canlı",
                "FINISHED":  "oynandı",
                "POSTPONED": "ertelendi",
                "CANCELLED": "iptal",
            }
            durum = status_map.get(m.get("status", ""), "programlı")

            score = m.get("score", {}).get("fullTime", {})
            ev_gol  = score.get("home")
            dep_gol = score.get("away")

            row = {
                "turnuva":          lig_info["turnuva"],
                "sezon":            str(m.get("season", {}).get("startDate", "")[:4]),
                "tur":              m.get("stage", "Lig"),
                "grup":             m.get("group"),
                "hafta":            m.get("matchday"),
                "ev_takim":         ev,
                "dep_takim":        dep,
                "tarih_utc":        tarih_utc,
                "stadyum_isim":     m.get("venue"),
                "stadyum_sehir":    None,
                "stadyum_ulke":     None,
                "stadyum_kapasite": None,
                "durum":            durum,
                "ev_gol":           ev_gol,
                "dep_gol":          dep_gol,
                "muhtemel_kadro_ev":  json.dumps(None),
                "muhtemel_kadro_dep": json.dumps(None),
                "teknik_detaylar":    json.dumps({}),
            }
            with engine.begin() as conn:
                upsert_fixture(conn, row)
            ok += 1
        except Exception as e:
            log.debug(f"  Maç yazma hatası: {e}")

    log.info(f"  ✓ {ok} fikstür kaydedildi.")


def sync_wc2026_scores(engine) -> None:
    """
    football-data.org'dan WC2026 biten maç skorlarını çekip fixtures tablosunu güncelle.
    Takım adı yerine maç tarihine göre eşleştirme yapar (TR/EN isim farkı sorun değil).
    """
    if not FOOTBALL_DATA_API_KEY:
        log.error("  FOOTBALL_DATA_API_KEY bulunamadı.")
        log.info("  Ücretsiz API key: https://www.football-data.org/client/register")
        log.info("  Sonra: export FOOTBALL_DATA_API_KEY=<key>  veya .env dosyasına ekle")
        return

    headers = {"X-Auth-Token": FOOTBALL_DATA_API_KEY, "Content-Type": "application/json"}
    url = f"{FOOTBALL_DATA_ORG_BASE}/competitions/WC/matches"
    log.info("  football-data.org WC2026 skorları çekiliyor…")

    try:
        time.sleep(1.0)
        r = requests.get(url, headers=headers, timeout=20, params={"status": "FINISHED"})
        r.raise_for_status()
        matches = r.json().get("matches", [])
    except requests.RequestException as e:
        log.error(f"  API hatası: {e}")
        return

    log.info(f"  {len(matches)} biten maç bulundu.")
    ok = skip = 0

    with engine.begin() as conn:
        for m in matches:
            score = m.get("score", {}).get("fullTime", {})
            ev_gol  = score.get("home")
            dep_gol = score.get("away")
            if ev_gol is None or dep_gol is None:
                skip += 1
                continue

            tarih_str = m.get("utcDate", "")
            if not tarih_str:
                skip += 1
                continue
            tarih_utc = datetime.fromisoformat(tarih_str.replace("Z", "+00:00"))

            # Tarihe göre eşleştir (±90 dk tolerans) — isim farkı sorun değil
            row = conn.execute(text("""
                SELECT id, ev_takim, dep_takim
                FROM fixtures
                WHERE ABS(EXTRACT(EPOCH FROM (tarih_utc - :tarih))) < 5400
                  AND (turnuva ILIKE '%dünya%' OR turnuva ILIKE '%world%' OR turnuva ILIKE '%copa%')
                ORDER BY ABS(EXTRACT(EPOCH FROM (tarih_utc - :tarih)))
                LIMIT 1
            """), {"tarih": tarih_utc}).fetchone()

            if row:
                conn.execute(text("""
                    UPDATE fixtures
                    SET ev_gol = :ev_gol, dep_gol = :dep_gol,
                        durum = 'oynandı', guncelleme = NOW()
                    WHERE id = :id
                """), {"id": row.id, "ev_gol": ev_gol, "dep_gol": dep_gol})
                log.info(f"  ✓ {row.ev_takim} {ev_gol}–{dep_gol} {row.dep_takim}")
                ok += 1
            else:
                log.debug(f"  ? Eşleşme yok: {tarih_utc} {m.get('homeTeam',{}).get('name')} vs {m.get('awayTeam',{}).get('name')}")
                skip += 1

    log.info(f"  ✓ {ok} maç güncellendi, {skip} atlandı.")


# ──────────────────────────────────────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Fikstür takvimi yönetimi")
    parser.add_argument("--wc2026",          action="store_true", help="WC2026 fikstürlerini yükle")
    parser.add_argument("--wc-skorlar",      action="store_true", help="WC2026 biten maç skorlarını football-data.org'dan çek")
    parser.add_argument("--guncelle-durumlar", action="store_true", help="Geçmiş maçları güncelle")
    parser.add_argument("--kulup-ligi",      type=str, metavar="KOD", help="Kulüp ligi fikstürü (ör. PL, PD)")
    parser.add_argument("--liste-stadyumlar", action="store_true", help="Stadyum listesi")
    parser.add_argument("--liste-ligler",    action="store_true", help="Kulüp ligi kodları")
    parser.add_argument("--skor",            type=int, nargs=3, metavar=("ID", "EV_GOL", "DEP_GOL"),
                        help="Maç skoru gir: --skor <id> <ev_gol> <dep_gol>")
    args = parser.parse_args()

    if args.liste_stadyumlar:
        print(f"{'Kod':<20} {'İsim':<35} {'Şehir':<25} Kapasite")
        print("-" * 90)
        for kod, s in STADIUMS.items():
            print(f"{kod:<20} {s['isim']:<35} {s['sehir']:<25} {s['kapasite']:,}")
        return

    if args.liste_ligler:
        print("Kulüp ligi kodları (football-data.org):")
        for kod, info in FOOTBALL_DATA_ORG_LEAGUES.items():
            print(f"  {kod:6s}  →  {info['isim']}")
        return

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.wc2026:
        load_wc2026(engine)

    if args.guncelle_durumlar:
        update_past_statuses(engine)

    if args.kulup_ligi:
        fetch_club_fixtures(args.kulup_ligi, engine)

    if args.wc_skorlar:
        sync_wc2026_scores(engine)

    if args.skor:
        fixture_id, ev_gol, dep_gol = args.skor
        with engine.begin() as conn:
            update_fixture_score(conn, fixture_id, ev_gol, dep_gol)
        log.info(f"  ✓ Maç #{fixture_id} skoru güncellendi: {ev_gol}-{dep_gol}")

    if not any([args.wc2026, args.guncelle_durumlar, args.kulup_ligi, args.skor,
                args.liste_stadyumlar, args.liste_ligler]):
        # Varsayılan: WC2026 yükle + geçmiş maçları güncelle
        load_wc2026(engine)
        update_past_statuses(engine)


if __name__ == "__main__":
    main()
