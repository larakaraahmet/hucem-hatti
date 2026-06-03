#!/usr/bin/env python3
"""
Transfermarkt piyasa değeri yükleyici.
Oyuncu yaşı, kulüp, piyasa değeri ve sözleşme bilgilerini çeker.

Kullanım:
    python ingest_transfermarkt.py                    # tüm DB oyuncuları
    python ingest_transfermarkt.py --milliyet France  # sadece Fransız oyuncular
    python ingest_transfermarkt.py --oyuncu-id 3009   # tek oyuncu

Rate limit: 2 saniye bekleme, User-Agent header zorunlu.
Veri yoksa sessizce atlar, hata olmaz.
"""

import argparse
import logging
import os
import re
import sys
import time
from typing import Optional

import pandas as pd
import requests
from sqlalchemy import create_engine, text
from tqdm import tqdm

log = logging.getLogger(__name__)
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

# Rate limit ve header ayarları (Transfermarkt scraping politikasına uygun)
RATE_LIMIT_SEC = 2.5
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (compatible; HuCemHatti/1.0; "
        "+https://github.com/hucem-hatti/analytics)"
    ),
    "Accept-Language": "tr-TR,tr;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.transfermarkt.com/",
}
BASE_URL = "https://www.transfermarkt.com"
TM_SEARCH = "https://www.transfermarkt.com/schnellsuche/ergebnis/schnellsuche?query={query}"


def _get(url: str, session: requests.Session, retries: int = 3) -> Optional[requests.Response]:
    """Rate-limited GET; başarısız olursa None döner."""
    for attempt in range(retries):
        try:
            time.sleep(RATE_LIMIT_SEC)
            r = session.get(url, headers=HEADERS, timeout=15)
            if r.status_code == 200:
                return r
            if r.status_code == 429:
                wait = 10 * (attempt + 1)
                log.warning(f"  429 Too Many Requests, {wait}s bekleniyor…")
                time.sleep(wait)
        except requests.RequestException as e:
            log.debug(f"  İstek hatası ({attempt+1}/{retries}): {e}")
    return None


def _parse_market_value(text: str) -> Optional[int]:
    """'€45.00m', '€900k' gibi değerleri EUR cinsinden integer'a çevirir."""
    if not text:
        return None
    text = text.strip().lower().replace(",", ".").replace("€", "").replace("£", "")
    try:
        if "m" in text:
            return int(float(text.replace("m", "").strip()) * 1_000_000)
        if "k" in text:
            return int(float(text.replace("k", "").strip()) * 1_000)
        return int(float(text))
    except (ValueError, TypeError):
        return None


def search_player_tm(name: str, session: requests.Session) -> Optional[dict]:
    """
    Transfermarkt'ta oyuncu arar.
    İlk sonucu döner: { isim, url, piyasa_degeri, kulup, yas, sozlesme_bitis }
    """
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        log.error("beautifulsoup4 bulunamadı: pip install beautifulsoup4 lxml")
        return None

    url = TM_SEARCH.format(query=requests.utils.quote(name))
    resp = _get(url, session)
    if not resp:
        return None

    soup = BeautifulSoup(resp.text, "lxml")

    # Oyuncu sonuç tablosu
    tables = soup.select("table.items")
    if not tables:
        return None

    for table in tables:
        header = table.find_previous("h2")
        if header and "player" not in header.get_text().lower() and "oyuncu" not in header.get_text().lower():
            # "clubs" tablosu gibi yanlış tablolar atlanır
            pass
        rows = table.select("tbody tr")
        for row in rows[:3]:  # İlk 3 sonuç
            cols = row.find_all("td")
            if len(cols) < 4:
                continue
            link = row.select_one("td.hauptlink a")
            if not link:
                continue
            player_name = link.get_text(strip=True)
            player_url  = BASE_URL + link.get("href", "")

            # Piyasa değeri
            mv_td = row.find("td", class_="rechts hauptlink")
            mv = _parse_market_value(mv_td.get_text() if mv_td else "")

            return {
                "isim":         player_name,
                "url":          player_url,
                "piyasa_degeri": mv,
            }
    return None


def get_player_details(url: str, session: requests.Session) -> dict:
    """Oyuncu profil sayfasından detay bilgileri çeker."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return {}

    resp = _get(url, session)
    if not resp:
        return {}

    soup = BeautifulSoup(resp.text, "lxml")
    details: dict = {}

    # Piyasa değeri
    mv_span = soup.select_one("a.data-header__market-value-wrapper")
    if mv_span:
        details["piyasa_degeri"] = _parse_market_value(mv_span.get_text())

    # Yaş
    age_span = soup.select_one("span[itemprop='birthDate']")
    if not age_span:
        age_span = soup.find("span", string=re.compile(r"\(age\s*\d+\)"))
    if age_span:
        age_match = re.search(r"\d{1,2}", age_span.get_text())
        if age_match:
            details["yas"] = int(age_match.group())

    # Kulüp
    club_a = soup.select_one("span.data-header__club a")
    if club_a:
        details["kulup"] = club_a.get_text(strip=True)

    # Sözleşme bitiş
    contract_spans = soup.select("span.data-header__label")
    for span in contract_spans:
        if "contract" in span.get_text().lower() or "sözleşme" in span.get_text().lower():
            next_elem = span.find_next_sibling()
            if next_elem:
                date_text = next_elem.get_text(strip=True)
                # "Jun 30, 2026" formatını parse et
                from datetime import datetime
                for fmt in ["%b %d, %Y", "%d.%m.%Y", "%Y-%m-%d"]:
                    try:
                        details["sozlesme_bitis"] = datetime.strptime(date_text, fmt).date()
                        break
                    except ValueError:
                        pass

    # Pozisyon
    pos_spans = soup.select("div.detail-position__position")
    if pos_spans:
        details["pozisyon"] = pos_spans[0].get_text(strip=True)

    return details


def upsert_market_value(conn, row: dict) -> None:
    conn.execute(text("""
        INSERT INTO player_market_values
            (oyuncu_id, external_isim, yas, kulup, piyasa_degeri,
             sozlesme_bitis, pozisyon, tm_profil_url, kaynak)
        VALUES
            (:oyuncu_id, :external_isim, :yas, :kulup, :piyasa_degeri,
             :sozlesme_bitis, :pozisyon, :tm_profil_url, 'transfermarkt')
        ON CONFLICT (oyuncu_id) DO UPDATE SET
            yas            = EXCLUDED.yas,
            kulup          = EXCLUDED.kulup,
            piyasa_degeri  = EXCLUDED.piyasa_degeri,
            sozlesme_bitis = EXCLUDED.sozlesme_bitis,
            pozisyon       = EXCLUDED.pozisyon,
            guncelleme     = NOW()
    """), row)


def ingest_player(pid: int, name: str, session: requests.Session, engine) -> bool:
    """Tek oyuncu için Transfermarkt verisi çeker."""
    log.debug(f"  Aranıyor: {name}")
    result = search_player_tm(name, session)
    if not result:
        log.debug(f"  Bulunamadı: {name}")
        return False

    details = {}
    if result.get("url"):
        details = get_player_details(result["url"], session)

    row = {
        "oyuncu_id":    pid,
        "external_isim": result["isim"],
        "yas":           details.get("yas"),
        "kulup":         details.get("kulup"),
        "piyasa_degeri": details.get("piyasa_degeri") or result.get("piyasa_degeri"),
        "sozlesme_bitis": details.get("sozlesme_bitis"),
        "pozisyon":      details.get("pozisyon"),
        "tm_profil_url": result.get("url"),
    }

    try:
        with engine.begin() as conn:
            upsert_market_value(conn, row)
        log.info(f"  ✓ {name} → {row.get('kulup', '?')} | €{row.get('piyasa_degeri', '?'):,} "
                 f"| sözleşme: {row.get('sozlesme_bitis', '?')}")
        return True
    except Exception as e:
        log.warning(f"  DB hatası ({name}): {e}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Transfermarkt piyasa değerleri")
    parser.add_argument("--oyuncu-id",  type=int, nargs="+", help="Belirli oyuncu ID'leri")
    parser.add_argument("--milliyet",   type=str, help="Milliyet filtresi (ör. France)")
    parser.add_argument("--min-dakika", type=int, default=270, help="Min. oynadığı dakika")
    parser.add_argument("--limit",      type=int, default=100, help="Max oyuncu sayısı")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.oyuncu_id:
        sql = "SELECT id AS oyuncu_id, isim FROM players WHERE id = ANY(:ids)"
        params = {"ids": args.oyuncu_id}
    else:
        sql = """
            SELECT DISTINCT p.id AS oyuncu_id, p.isim
            FROM players p
            JOIN player_match_stats pms ON pms.oyuncu_id = p.id
            WHERE (:milliyet IS NULL OR p.milliyet = :milliyet)
            GROUP BY p.id, p.isim
            HAVING SUM(pms.dakika) >= :min_dk
            ORDER BY p.isim
            LIMIT :limit
        """
        params = {"milliyet": args.milliyet, "min_dk": args.min_dakika, "limit": args.limit}

    with engine.connect() as conn:
        players = pd.DataFrame(conn.execute(text(sql), params).mappings())

    if players.empty:
        log.info("İşlenecek oyuncu bulunamadı.")
        return

    log.info(f"{len(players)} oyuncu için Transfermarkt verisi çekiliyor…")
    log.warning("⚠️  Rate limit: ~2.5 saniye/istek. Yüksek oyuncu sayısında uzun sürebilir.")

    session = requests.Session()
    success = 0
    for _, row in tqdm(players.iterrows(), total=len(players)):
        if ingest_player(int(row["oyuncu_id"]), str(row["isim"]), session, engine):
            success += 1

    log.info(f"\nTamamlandı: {success}/{len(players)} oyuncu güncellendi.")


if __name__ == "__main__":
    main()
