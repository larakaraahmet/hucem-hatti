#!/usr/bin/env python3
"""
ingest_stadiums.py — Stadyum veritabanı ve maç–stadyum bağlantısı
==================================================================

Küratörlü stadyum verilerini (kapasite, rakım, çim türü, konum…) DB'ye yazar
ve mevcut maçları doğru stadyuma bağlar.

Kullanım:
    python ingest_stadiums.py             # Tümünü ekle + maçları bağla
    python ingest_stadiums.py --rapor     # Bağlantı özeti
    python ingest_stadiums.py --sadece-bagla   # Stadyum eklemeden yalnızca maçları bağla
"""

import argparse, logging, os, sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://lara@localhost:5432/football")

log = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s",
                    handlers=[logging.StreamHandler(sys.stdout)])

# ─────────────────────────────────────────────────────────────────────────────
# STADYUM VERİTABANI
# isim, sehir, ulke, kapasite, rakim(m), cim_turu, lat, lon, acilis_yili, boyut
# ─────────────────────────────────────────────────────────────────────────────
STADIUMS = [
    # ══════════════════════════════════════════
    # PREMIER LEAGUE
    # ══════════════════════════════════════════
    dict(isim="Emirates Stadium",               sehir="London",          ulke="England",     kapasite=60704,  rakim=29,  cim_turu="Hibrit",  lat=51.554778, lon=-0.108611,  acilis_yili=2006, boyut="105×68 m"),
    dict(isim="Anfield",                        sehir="Liverpool",       ulke="England",     kapasite=61276,  rakim=22,  cim_turu="Doğal",   lat=53.430819, lon=-2.960827,  acilis_yili=1884, boyut="101×68 m"),
    dict(isim="Villa Park",                     sehir="Birmingham",      ulke="England",     kapasite=42682,  rakim=131, cim_turu="Hibrit",  lat=52.509167, lon=-1.884722,  acilis_yili=1897, boyut="105×68 m"),
    dict(isim="Vitality Stadium",               sehir="Bournemouth",     ulke="England",     kapasite=11364,  rakim=10,  cim_turu="Doğal",   lat=50.735278, lon=-1.838333,  acilis_yili=1910, boyut="105×68 m"),
    dict(isim="Gtech Community Stadium",        sehir="London",          ulke="England",     kapasite=17250,  rakim=21,  cim_turu="Doğal",   lat=51.491389, lon=-0.288611,  acilis_yili=2020, boyut="105×68 m"),
    dict(isim="Amex Stadium",                   sehir="Brighton",        ulke="England",     kapasite=31800,  rakim=46,  cim_turu="Doğal",   lat=50.861806, lon=-0.083472,  acilis_yili=2011, boyut="105×68 m"),
    dict(isim="Stamford Bridge",                sehir="London",          ulke="England",     kapasite=40343,  rakim=12,  cim_turu="Doğal",   lat=51.481667, lon=-0.191111,  acilis_yili=1877, boyut="103×67 m"),
    dict(isim="Selhurst Park",                  sehir="London",          ulke="England",     kapasite=25486,  rakim=62,  cim_turu="Doğal",   lat=51.398333, lon=-0.085556,  acilis_yili=1924, boyut="100×68 m"),
    dict(isim="Goodison Park",                  sehir="Liverpool",       ulke="England",     kapasite=39572,  rakim=30,  cim_turu="Doğal",   lat=53.438889, lon=-2.966389,  acilis_yili=1892, boyut="101×68 m"),
    dict(isim="Craven Cottage",                 sehir="London",          ulke="England",     kapasite=25700,  rakim=7,   cim_turu="Doğal",   lat=51.474722, lon=-0.221667,  acilis_yili=1896, boyut="100×65 m"),
    dict(isim="King Power Stadium",             sehir="Leicester",       ulke="England",     kapasite=32312,  rakim=71,  cim_turu="Doğal",   lat=52.620278, lon=-1.142222,  acilis_yili=2002, boyut="105×68 m"),
    dict(isim="Etihad Stadium",                 sehir="Manchester",      ulke="England",     kapasite=55017,  rakim=45,  cim_turu="Hibrit",  lat=53.483056, lon=-2.200278,  acilis_yili=2003, boyut="105×68 m"),
    dict(isim="Old Trafford",                   sehir="Manchester",      ulke="England",     kapasite=74310,  rakim=38,  cim_turu="Doğal",   lat=53.463056, lon=-2.291389,  acilis_yili=1910, boyut="105×68 m"),
    dict(isim="St James' Park",                 sehir="Newcastle",       ulke="England",     kapasite=52305,  rakim=31,  cim_turu="Doğal",   lat=54.975556, lon=-1.621667,  acilis_yili=1892, boyut="105×68 m"),
    dict(isim="City Ground",                    sehir="Nottingham",      ulke="England",     kapasite=30332,  rakim=27,  cim_turu="Doğal",   lat=52.940000, lon=-1.132500,  acilis_yili=1898, boyut="102×66 m"),
    dict(isim="St Mary's Stadium",              sehir="Southampton",     ulke="England",     kapasite=32505,  rakim=13,  cim_turu="Doğal",   lat=50.905833, lon=-1.391111,  acilis_yili=2001, boyut="105×68 m"),
    dict(isim="Tottenham Hotspur Stadium",      sehir="London",          ulke="England",     kapasite=62850,  rakim=25,  cim_turu="Hibrit",  lat=51.604444, lon=-0.066389,  acilis_yili=2019, boyut="115×68 m"),
    dict(isim="London Stadium",                 sehir="London",          ulke="England",     kapasite=62500,  rakim=11,  cim_turu="Doğal",   lat=51.538611, lon=-0.016389,  acilis_yili=2012, boyut="115×76 m"),
    dict(isim="Molineux Stadium",               sehir="Wolverhampton",   ulke="England",     kapasite=31750,  rakim=139, cim_turu="Doğal",   lat=52.590278, lon=-2.130278,  acilis_yili=1889, boyut="105×68 m"),
    dict(isim="Elland Road",                    sehir="Leeds",           ulke="England",     kapasite=37892,  rakim=50,  cim_turu="Doğal",   lat=53.778056, lon=-1.572222,  acilis_yili=1919, boyut="105×68 m"),
    dict(isim="Bramley-Moore Dock Stadium",     sehir="Liverpool",       ulke="England",     kapasite=52888,  rakim=8,   cim_turu="Hibrit",  lat=53.449167, lon=-2.984722,  acilis_yili=2025, boyut="105×68 m"),
    dict(isim="Carrow Road",                    sehir="Norwich",         ulke="England",     kapasite=27010,  rakim=8,   cim_turu="Doğal",   lat=52.622222, lon=1.309444,   acilis_yili=1935, boyut="105×68 m"),
    dict(isim="Falmer Stadium",                 sehir="Brighton",        ulke="England",     kapasite=31800,  rakim=46,  cim_turu="Doğal",   lat=50.861806, lon=-0.083472,  acilis_yili=2011, boyut="105×68 m"),
    dict(isim="Portman Road",                   sehir="Ipswich",         ulke="England",     kapasite=29007,  rakim=16,  cim_turu="Doğal",   lat=52.054722, lon=1.144722,   acilis_yili=1884, boyut="102×66 m"),

    # ══════════════════════════════════════════
    # BUNDESLIGA
    # ══════════════════════════════════════════
    dict(isim="Allianz Arena",                  sehir="Munich",          ulke="Germany",     kapasite=75024,  rakim=521, cim_turu="Doğal",   lat=48.218775, lon=11.624753,  acilis_yili=2005, boyut="105×68 m"),
    dict(isim="Signal Iduna Park",              sehir="Dortmund",        ulke="Germany",     kapasite=81365,  rakim=86,  cim_turu="Doğal",   lat=51.492528, lon=7.451808,   acilis_yili=1974, boyut="105×68 m"),
    dict(isim="BayArena",                       sehir="Leverkusen",      ulke="Germany",     kapasite=30210,  rakim=56,  cim_turu="Doğal",   lat=51.038333, lon=7.002222,   acilis_yili=1958, boyut="105×68 m"),
    dict(isim="Red Bull Arena",                 sehir="Leipzig",         ulke="Germany",     kapasite=47069,  rakim=118, cim_turu="Doğal",   lat=51.345853, lon=12.348319,  acilis_yili=2004, boyut="105×68 m"),
    dict(isim="Deutsche Bank Park",             sehir="Frankfurt",       ulke="Germany",     kapasite=58000,  rakim=103, cim_turu="Doğal",   lat=50.068686, lon=8.645250,   acilis_yili=1925, boyut="105×68 m"),
    dict(isim="Borussia-Park",                  sehir="Mönchengladbach", ulke="Germany",     kapasite=54010,  rakim=82,  cim_turu="Doğal",   lat=51.174167, lon=6.385278,   acilis_yili=2004, boyut="105×68 m"),
    dict(isim="MHPArena",                       sehir="Stuttgart",       ulke="Germany",     kapasite=60469,  rakim=246, cim_turu="Doğal",   lat=48.792453, lon=9.232408,   acilis_yili=1933, boyut="105×68 m"),
    dict(isim="Volksparkstadion",               sehir="Hamburg",         ulke="Germany",     kapasite=57000,  rakim=14,  cim_turu="Doğal",   lat=53.587500, lon=9.901111,   acilis_yili=1953, boyut="105×68 m"),
    dict(isim="WWK Arena",                      sehir="Augsburg",        ulke="Germany",     kapasite=30660,  rakim=494, cim_turu="Doğal",   lat=48.323889, lon=10.886944,  acilis_yili=2009, boyut="105×68 m"),
    dict(isim="Volkswagen Arena",               sehir="Wolfsburg",       ulke="Germany",     kapasite=30000,  rakim=63,  cim_turu="Doğal",   lat=52.432778, lon=10.803889,  acilis_yili=2002, boyut="105×68 m"),
    dict(isim="PreZero Arena",                  sehir="Sinsheim",        ulke="Germany",     kapasite=30150,  rakim=180, cim_turu="Doğal",   lat=49.239722, lon=8.889167,   acilis_yili=2009, boyut="105×68 m"),
    dict(isim="Europa-Park Stadion",            sehir="Freiburg",        ulke="Germany",     kapasite=34700,  rakim=265, cim_turu="Doğal",   lat=48.020556, lon=7.826944,   acilis_yili=2021, boyut="105×68 m"),
    dict(isim="Veltins-Arena",                  sehir="Gelsenkirchen",   ulke="Germany",     kapasite=62271,  rakim=32,  cim_turu="Yapay",   lat=51.554167, lon=7.067778,   acilis_yili=2001, boyut="105×68 m"),
    dict(isim="RheinEnergieStadion",            sehir="Cologne",         ulke="Germany",     kapasite=49698,  rakim=56,  cim_turu="Doğal",   lat=50.933611, lon=6.875000,   acilis_yili=1923, boyut="105×68 m"),
    dict(isim="MEWA Arena",                     sehir="Mainz",           ulke="Germany",     kapasite=34034,  rakim=92,  cim_turu="Doğal",   lat=49.984722, lon=8.224722,   acilis_yili=2011, boyut="105×68 m"),
    dict(isim="Vonovia Ruhrstadion",            sehir="Bochum",          ulke="Germany",     kapasite=27599,  rakim=93,  cim_turu="Doğal",   lat=51.490000, lon=7.235000,   acilis_yili=1911, boyut="105×68 m"),
    dict(isim="Merck-Stadion am Böllenfalltor", sehir="Darmstadt",       ulke="Germany",     kapasite=17810,  rakim=148, cim_turu="Doğal",   lat=49.866389, lon=8.663889,   acilis_yili=1921, boyut="100×66 m"),
    dict(isim="Olympiastadion",                 sehir="Berlin",          ulke="Germany",     kapasite=74461,  rakim=42,  cim_turu="Doğal",   lat=52.514722, lon=13.239722,  acilis_yili=1936, boyut="105×68 m"),

    # ══════════════════════════════════════════
    # LA LIGA
    # ══════════════════════════════════════════
    dict(isim="Estadi Olímpic Lluís Companys",  sehir="Barcelona",       ulke="Spain",       kapasite=55926,  rakim=94,  cim_turu="Doğal",   lat=41.364722, lon=2.157500,   acilis_yili=1927, boyut="105×68 m"),
    dict(isim="Camp Nou",                       sehir="Barcelona",       ulke="Spain",       kapasite=99354,  rakim=94,  cim_turu="Doğal",   lat=41.380898, lon=2.122820,   acilis_yili=1957, boyut="105×68 m"),
    dict(isim="Santiago Bernabéu",              sehir="Madrid",          ulke="Spain",       kapasite=81044,  rakim=667, cim_turu="Hibrit",  lat=40.453060, lon=-3.688344,  acilis_yili=1947, boyut="105×68 m"),
    dict(isim="Cívitas Metropolitano",          sehir="Madrid",          ulke="Spain",       kapasite=68456,  rakim=619, cim_turu="Doğal",   lat=40.436108, lon=-3.599822,  acilis_yili=2017, boyut="105×68 m"),
    dict(isim="Estadio Ramón Sánchez-Pizjuán",  sehir="Seville",         ulke="Spain",       kapasite=43883,  rakim=16,  cim_turu="Doğal",   lat=37.384167, lon=-5.970833,  acilis_yili=1958, boyut="105×68 m"),
    dict(isim="Mestalla",                       sehir="Valencia",        ulke="Spain",       kapasite=49430,  rakim=11,  cim_turu="Doğal",   lat=39.474639, lon=-0.358000,  acilis_yili=1923, boyut="105×68 m"),
    dict(isim="Estadio de la Cerámica",         sehir="Villarreal",      ulke="Spain",       kapasite=23500,  rakim=38,  cim_turu="Doğal",   lat=39.944444, lon=-0.103611,  acilis_yili=1923, boyut="105×68 m"),
    dict(isim="San Mamés",                      sehir="Bilbao",          ulke="Spain",       kapasite=53289,  rakim=14,  cim_turu="Doğal",   lat=43.264167, lon=-2.949722,  acilis_yili=2013, boyut="105×68 m"),
    dict(isim="Estadio Municipal de Butarque",  sehir="Leganés",         ulke="Spain",       kapasite=11454,  rakim=664, cim_turu="Doğal",   lat=40.340278, lon=-3.769167,  acilis_yili=1998, boyut="105×68 m"),
    dict(isim="Reale Arena",                    sehir="San Sebastián",   ulke="Spain",       kapasite=39500,  rakim=7,   cim_turu="Doğal",   lat=43.301667, lon=-1.974167,  acilis_yili=1993, boyut="105×68 m"),
    dict(isim="RCDE Stadium",                   sehir="Barcelona",       ulke="Spain",       kapasite=40000,  rakim=12,  cim_turu="Doğal",   lat=41.346944, lon=2.074722,   acilis_yili=2009, boyut="105×68 m"),
    dict(isim="Estadio de Gran Canaria",        sehir="Las Palmas",      ulke="Spain",       kapasite=32400,  rakim=25,  cim_turu="Doğal",   lat=28.099722, lon=-15.457222, acilis_yili=2003, boyut="105×68 m"),
    dict(isim="El Alcoraz",                     sehir="Huesca",          ulke="Spain",       kapasite=9803,   rakim=484, cim_turu="Doğal",   lat=42.140556, lon=-0.408333,  acilis_yili=1972, boyut="100×68 m"),
    dict(isim="Estadio Mendizorroza",           sehir="Vitoria-Gasteiz", ulke="Spain",       kapasite=19840,  rakim=539, cim_turu="Doğal",   lat=42.850000, lon=-2.700556,  acilis_yili=1924, boyut="106×68 m"),
    dict(isim="Estadio El Madrigal",            sehir="Villarreal",      ulke="Spain",       kapasite=23500,  rakim=38,  cim_turu="Doğal",   lat=39.944444, lon=-0.103611,  acilis_yili=1923, boyut="105×68 m"),
    dict(isim="Balaídos",                       sehir="Vigo",            ulke="Spain",       kapasite=29000,  rakim=30,  cim_turu="Doğal",   lat=42.211944, lon=-8.739167,  acilis_yili=1928, boyut="105×68 m"),
    dict(isim="Estadio de Vallecas",            sehir="Madrid",          ulke="Spain",       kapasite=14708,  rakim=643, cim_turu="Doğal",   lat=40.391667, lon=-3.651389,  acilis_yili=1976, boyut="100×65 m"),
    dict(isim="Estadio Nuevo Los Cármenes",     sehir="Granada",         ulke="Spain",       kapasite=22524,  rakim=688, cim_turu="Doğal",   lat=37.152778, lon=-3.599444,  acilis_yili=1995, boyut="105×68 m"),
    dict(isim="Power Horse Stadium",            sehir="Almería",         ulke="Spain",       kapasite=22000,  rakim=27,  cim_turu="Doğal",   lat=36.845556, lon=-2.454167,  acilis_yili=2004, boyut="105×68 m"),

    # ══════════════════════════════════════════
    # SERIE A
    # ══════════════════════════════════════════
    dict(isim="San Siro",                       sehir="Milan",           ulke="Italy",       kapasite=75817,  rakim=122, cim_turu="Doğal",   lat=45.478056, lon=9.124167,   acilis_yili=1926, boyut="105×68 m"),
    dict(isim="Allianz Stadium",                sehir="Turin",           ulke="Italy",       kapasite=41507,  rakim=239, cim_turu="Doğal",   lat=45.109722, lon=7.641111,   acilis_yili=2011, boyut="105×68 m"),
    dict(isim="Stadio Diego Armando Maradona",  sehir="Naples",          ulke="Italy",       kapasite=54726,  rakim=17,  cim_turu="Doğal",   lat=40.827963, lon=14.193089,  acilis_yili=1959, boyut="105×68 m"),
    dict(isim="Stadio Olimpico",                sehir="Rome",            ulke="Italy",       kapasite=70634,  rakim=22,  cim_turu="Doğal",   lat=41.933611, lon=12.454722,  acilis_yili=1937, boyut="105×68 m"),
    dict(isim="Gewiss Stadium",                 sehir="Bergamo",         ulke="Italy",       kapasite=21747,  rakim=248, cim_turu="Doğal",   lat=45.708611, lon=9.680000,   acilis_yili=1928, boyut="105×68 m"),
    dict(isim="Stadio Artemio Franchi",         sehir="Florence",        ulke="Italy",       kapasite=43147,  rakim=50,  cim_turu="Doğal",   lat=43.780556, lon=11.282500,  acilis_yili=1931, boyut="105×68 m"),
    dict(isim="Mapei Stadium",                  sehir="Reggio Emilia",   ulke="Italy",       kapasite=21525,  rakim=58,  cim_turu="Doğal",   lat=44.699167, lon=10.553333,  acilis_yili=1994, boyut="105×68 m"),
    dict(isim="Stadio Luigi Ferraris",          sehir="Genoa",           ulke="Italy",       kapasite=36685,  rakim=10,  cim_turu="Doğal",   lat=44.415278, lon=8.952778,   acilis_yili=1911, boyut="100×68 m"),
    dict(isim="Stadio Bentegodi",               sehir="Verona",          ulke="Italy",       kapasite=39211,  rakim=61,  cim_turu="Doğal",   lat=45.437500, lon=10.973611,  acilis_yili=1963, boyut="105×68 m"),
    dict(isim="Stadio Friuli",                  sehir="Udine",           ulke="Italy",       kapasite=25144,  rakim=113, cim_turu="Doğal",   lat=46.080278, lon=13.188889,  acilis_yili=1976, boyut="105×68 m"),
    dict(isim="Stadio Carlo Castellani",        sehir="Empoli",          ulke="Italy",       kapasite=16284,  rakim=28,  cim_turu="Doğal",   lat=43.725556, lon=10.953056,  acilis_yili=1965, boyut="105×68 m"),
    dict(isim="Stadio Olimpico di Torino",      sehir="Turin",           ulke="Italy",       kapasite=28140,  rakim=239, cim_turu="Doğal",   lat=45.073889, lon=7.636389,   acilis_yili=1933, boyut="105×68 m"),

    # ══════════════════════════════════════════
    # LIGUE 1
    # ══════════════════════════════════════════
    dict(isim="Parc des Princes",               sehir="Paris",           ulke="France",      kapasite=47929,  rakim=36,  cim_turu="Doğal",   lat=48.841389, lon=2.252778,   acilis_yili=1972, boyut="105×68 m"),
    dict(isim="Stade Vélodrome",                sehir="Marseille",       ulke="France",      kapasite=67394,  rakim=30,  cim_turu="Doğal",   lat=43.269722, lon=5.395833,   acilis_yili=1937, boyut="105×68 m"),
    dict(isim="Groupama Stadium",               sehir="Lyon",            ulke="France",      kapasite=59186,  rakim=191, cim_turu="Doğal",   lat=45.765000, lon=4.982222,   acilis_yili=2016, boyut="105×68 m"),
    dict(isim="Stade Louis II",                 sehir="Monaco",          ulke="Monaco",      kapasite=18523,  rakim=12,  cim_turu="Doğal",   lat=43.727778, lon=7.415278,   acilis_yili=1985, boyut="105×68 m"),
    dict(isim="Stade Pierre-Mauroy",            sehir="Villeneuve-d'Ascq",ulke="France",     kapasite=50186,  rakim=30,  cim_turu="Doğal",   lat=50.612222, lon=3.130556,   acilis_yili=2012, boyut="105×68 m"),
    dict(isim="Allianz Riviera",                sehir="Nice",            ulke="France",      kapasite=35624,  rakim=42,  cim_turu="Doğal",   lat=43.705278, lon=7.192500,   acilis_yili=2013, boyut="105×68 m"),
    dict(isim="Stade du Roudourou",             sehir="Guingamp",        ulke="France",      kapasite=18075,  rakim=78,  cim_turu="Doğal",   lat=48.556944, lon=-3.155833,  acilis_yili=1988, boyut="105×68 m"),
    dict(isim="Stade Auguste-Delaune",          sehir="Reims",           ulke="France",      kapasite=20540,  rakim=87,  cim_turu="Doğal",   lat=49.258056, lon=4.031944,   acilis_yili=1935, boyut="105×68 m"),
    dict(isim="Stade de la Beaujoire",          sehir="Nantes",          ulke="France",      kapasite=37473,  rakim=12,  cim_turu="Doğal",   lat=47.256111, lon=-1.524444,  acilis_yili=1984, boyut="105×68 m"),
    dict(isim="Stade Geoffroy-Guichard",        sehir="Saint-Étienne",   ulke="France",      kapasite=41965,  rakim=395, cim_turu="Doğal",   lat=45.460833, lon=4.390000,   acilis_yili=1931, boyut="105×68 m"),
    dict(isim="Stade de la Mosson",             sehir="Montpellier",     ulke="France",      kapasite=32900,  rakim=15,  cim_turu="Doğal",   lat=43.621944, lon=3.812778,   acilis_yili=1972, boyut="105×68 m"),
    dict(isim="Parc des Sports",                sehir="Angers",          ulke="France",      kapasite=18193,  rakim=40,  cim_turu="Doğal",   lat=47.486667, lon=-0.545556,  acilis_yili=1927, boyut="105×68 m"),
    dict(isim="Stade Chaban-Delmas",            sehir="Bordeaux",        ulke="France",      kapasite=34694,  rakim=13,  cim_turu="Doğal",   lat=44.862222, lon=-0.581111,  acilis_yili=1938, boyut="105×68 m"),
    dict(isim="Stade d'Ornano",                 sehir="Caen",            ulke="France",      kapasite=21000,  rakim=32,  cim_turu="Doğal",   lat=49.183889, lon=-0.391111,  acilis_yili=1921, boyut="105×68 m"),
    dict(isim="Stade Bonal",                    sehir="Montbéliard",     ulke="France",      kapasite=20005,  rakim=330, cim_turu="Doğal",   lat=47.480556, lon=6.790278,   acilis_yili=1973, boyut="105×68 m"),
    dict(isim="Stade Océane",                   sehir="Le Havre",        ulke="France",      kapasite=25178,  rakim=10,  cim_turu="Doğal",   lat=49.497778, lon=0.130278,   acilis_yili=2012, boyut="105×68 m"),
    dict(isim="Stade Francis-Le Blé",           sehir="Brest",           ulke="France",      kapasite=15097,  rakim=20,  cim_turu="Doğal",   lat=48.400278, lon=-4.474722,  acilis_yili=1922, boyut="100×65 m"),
    dict(isim="Stade du Moustoir",              sehir="Lorient",         ulke="France",      kapasite=18973,  rakim=24,  cim_turu="Doğal",   lat=47.760000, lon=-3.360000,  acilis_yili=1967, boyut="105×68 m"),
    dict(isim="Stade de la Licorne",            sehir="Amiens",          ulke="France",      kapasite=12097,  rakim=34,  cim_turu="Doğal",   lat=49.910556, lon=2.274167,   acilis_yili=1999, boyut="105×68 m"),
    dict(isim="Stade Armand-Cesari",            sehir="Bastia",          ulke="France",      kapasite=10009,  rakim=10,  cim_turu="Doğal",   lat=42.625278, lon=9.432778,   acilis_yili=1981, boyut="100×66 m"),
    dict(isim="Stade de l'Abbé-Deschamps",      sehir="Auxerre",         ulke="France",      kapasite=22000,  rakim=106, cim_turu="Doğal",   lat=47.782222, lon=3.556667,   acilis_yili=1918, boyut="105×68 m"),
    dict(isim="Stade Gabriel-Montpied",         sehir="Clermont-Ferrand",ulke="France",      kapasite=11980,  rakim=401, cim_turu="Doğal",   lat=45.803056, lon=3.064722,   acilis_yili=1970, boyut="100×66 m"),
    dict(isim="Stade Louis-Dugauguez",          sehir="Sedan",           ulke="France",      kapasite=23500,  rakim=155, cim_turu="Doğal",   lat=49.705278, lon=4.945278,   acilis_yili=1929, boyut="105×68 m"),
    dict(isim="Stade Marcel-Picot",             sehir="Nancy",           ulke="France",      kapasite=20087,  rakim=212, cim_turu="Doğal",   lat=48.678889, lon=6.200000,   acilis_yili=1926, boyut="105×68 m"),
    dict(isim="Stade Gaston-Gérard",            sehir="Dijon",           ulke="France",      kapasite=15753,  rakim=255, cim_turu="Doğal",   lat=47.330278, lon=5.053333,   acilis_yili=1934, boyut="105×68 m"),
    dict(isim="Stade de Nice",                  sehir="Nice",            ulke="France",      kapasite=35624,  rakim=42,  cim_turu="Doğal",   lat=43.705278, lon=7.192500,   acilis_yili=2013, boyut="105×68 m"),
    dict(isim="La Meinau",                      sehir="Strasbourg",      ulke="France",      kapasite=29230,  rakim=140, cim_turu="Doğal",   lat=48.560278, lon=7.754722,   acilis_yili=1914, boyut="105×68 m"),
    dict(isim="Stade du Pays de Charleroi",     sehir="Charleroi",       ulke="Belgium",     kapasite=15000,  rakim=110, cim_turu="Doğal",   lat=50.403611, lon=4.418333,   acilis_yili=1935, boyut="105×68 m"),
    dict(isim="Stade Roudourou",                sehir="Guingamp",        ulke="France",      kapasite=18075,  rakim=78,  cim_turu="Doğal",   lat=48.556944, lon=-3.155833,  acilis_yili=1988, boyut="105×68 m"),
    dict(isim="Parc de Princes",                sehir="Brest",           ulke="France",      kapasite=15097,  rakim=20,  cim_turu="Doğal",   lat=48.400278, lon=-4.474722,  acilis_yili=1922, boyut="100×65 m"),

    # ══════════════════════════════════════════
    # UEFA CHAMPIONS LEAGUE (UCL sık kullanılan)
    # ══════════════════════════════════════════
    dict(isim="Wembley Stadium",                sehir="London",          ulke="England",     kapasite=90000,  rakim=17,  cim_turu="Doğal",   lat=51.556019, lon=-0.279543,  acilis_yili=2007, boyut="115×76 m"),

    # ══════════════════════════════════════════
    # FIFA WORLD CUP 2022 — KATAR
    # ══════════════════════════════════════════
    dict(isim="Lusail Stadium",                 sehir="Lusail",          ulke="Qatar",       kapasite=88966,  rakim=10,  cim_turu="Hibrit",  lat=25.429722, lon=51.520833,  acilis_yili=2022, boyut="105×68 m"),
    dict(isim="Al Bayt Stadium",                sehir="Al Khor",         ulke="Qatar",       kapasite=60000,  rakim=10,  cim_turu="Hibrit",  lat=25.660753, lon=51.452508,  acilis_yili=2021, boyut="105×68 m"),
    dict(isim="Khalifa International Stadium",  sehir="Doha",            ulke="Qatar",       kapasite=45857,  rakim=12,  cim_turu="Hibrit",  lat=25.263611, lon=51.442500,  acilis_yili=1976, boyut="105×68 m"),
    dict(isim="Al Thumama Stadium",             sehir="Doha",            ulke="Qatar",       kapasite=40000,  rakim=15,  cim_turu="Hibrit",  lat=25.231944, lon=51.533889,  acilis_yili=2021, boyut="105×68 m"),
    dict(isim="Ahmad Bin Ali Stadium",          sehir="Ar-Rayyan",       ulke="Qatar",       kapasite=44740,  rakim=16,  cim_turu="Hibrit",  lat=25.293056, lon=51.383333,  acilis_yili=2021, boyut="105×68 m"),
    dict(isim="Al Janoub Stadium",              sehir="Al Wakrah",       ulke="Qatar",       kapasite=40000,  rakim=10,  cim_turu="Hibrit",  lat=25.155833, lon=51.489444,  acilis_yili=2019, boyut="105×68 m"),
    dict(isim="Education City Stadium",         sehir="Ar-Rayyan",       ulke="Qatar",       kapasite=40000,  rakim=14,  cim_turu="Hibrit",  lat=25.311111, lon=51.424444,  acilis_yili=2020, boyut="105×68 m"),
    dict(isim="Stadium 974",                    sehir="Doha",            ulke="Qatar",       kapasite=44089,  rakim=10,  cim_turu="Hibrit",  lat=25.267222, lon=51.538889,  acilis_yili=2021, boyut="105×68 m"),

    # ══════════════════════════════════════════
    # FIFA WORLD CUP 2018 — RUSYA
    # ══════════════════════════════════════════
    dict(isim="Luzhniki Stadium",               sehir="Moscow",          ulke="Russia",      kapasite=81000,  rakim=145, cim_turu="Doğal",   lat=55.715833, lon=37.554167,  acilis_yili=1956, boyut="105×68 m"),
    dict(isim="Saint Petersburg Stadium",       sehir="Saint Petersburg",ulke="Russia",      kapasite=68134,  rakim=10,  cim_turu="Doğal",   lat=59.972639, lon=30.220833,  acilis_yili=2017, boyut="105×68 m"),
    dict(isim="Fisht Olympic Stadium",          sehir="Sochi",           ulke="Russia",      kapasite=47659,  rakim=15,  cim_turu="Doğal",   lat=43.400417, lon=39.957639,  acilis_yili=2013, boyut="105×68 m"),
    dict(isim="Kazan Arena",                    sehir="Kazan",           ulke="Russia",      kapasite=45379,  rakim=51,  cim_turu="Doğal",   lat=55.820833, lon=49.144167,  acilis_yili=2013, boyut="105×68 m"),
    dict(isim="Nizhny Novgorod Stadium",        sehir="Nizhny Novgorod", ulke="Russia",      kapasite=44899,  rakim=90,  cim_turu="Doğal",   lat=56.337500, lon=43.965556,  acilis_yili=2018, boyut="105×68 m"),
    dict(isim="Rostov Arena",                   sehir="Rostov-on-Don",   ulke="Russia",      kapasite=45145,  rakim=40,  cim_turu="Doğal",   lat=47.211944, lon=39.714722,  acilis_yili=2018, boyut="105×68 m"),
    dict(isim="Spartak Stadium",                sehir="Moscow",          ulke="Russia",      kapasite=45360,  rakim=160, cim_turu="Doğal",   lat=55.818333, lon=37.441944,  acilis_yili=2014, boyut="105×68 m"),
    dict(isim="Ekaterinburg Arena",             sehir="Yekaterinburg",   ulke="Russia",      kapasite=35696,  rakim=254, cim_turu="Doğal",   lat=56.843333, lon=60.735000,  acilis_yili=1957, boyut="105×68 m"),
    dict(isim="Kaliningrad Stadium",            sehir="Kaliningrad",     ulke="Russia",      kapasite=35212,  rakim=15,  cim_turu="Doğal",   lat=54.705833, lon=20.521667,  acilis_yili=2018, boyut="105×68 m"),
    dict(isim="Mordovia Arena",                 sehir="Saransk",         ulke="Russia",      kapasite=41685,  rakim=105, cim_turu="Doğal",   lat=54.188889, lon=45.183611,  acilis_yili=2018, boyut="105×68 m"),
    dict(isim="Samara Arena",                   sehir="Samara",          ulke="Russia",      kapasite=44918,  rakim=50,  cim_turu="Doğal",   lat=53.406111, lon=50.186667,  acilis_yili=2018, boyut="105×68 m"),
    dict(isim="Volgograd Arena",                sehir="Volgograd",       ulke="Russia",      kapasite=45568,  rakim=40,  cim_turu="Doğal",   lat=48.738889, lon=44.500556,  acilis_yili=2018, boyut="105×68 m"),

    # ══════════════════════════════════════════
    # UEFA EURO 2024 — ALMANYA
    # ══════════════════════════════════════════
    # Allianz Arena, Signal Iduna Park, MHPArena, Deutsche Bank Park, Volksparkstadion,
    # Veltins-Arena, RheinEnergieStadion, Red Bull Arena, Olympiastadion — yukarıda mevcut
    dict(isim="Düsseldorf Arena",               sehir="Düsseldorf",      ulke="Germany",     kapasite=54600,  rakim=38,  cim_turu="Yapay",   lat=51.262222, lon=6.731667,   acilis_yili=2005, boyut="105×68 m"),

    # ══════════════════════════════════════════
    # UEFA EURO 2020 — ÇEŞITLI ÜLKELER
    # ══════════════════════════════════════════
    # Wembley, Stadio Olimpico (Rome) — yukarıda mevcut
    dict(isim="Puskás Aréna",                   sehir="Budapest",        ulke="Hungary",     kapasite=67889,  rakim=109, cim_turu="Doğal",   lat=47.503333, lon=19.062778,  acilis_yili=2019, boyut="105×68 m"),
    dict(isim="Baku Olympic Stadium",           sehir="Baku",            ulke="Azerbaijan",  kapasite=68700,  rakim=8,   cim_turu="Doğal",   lat=40.401944, lon=49.963611,  acilis_yili=2015, boyut="105×68 m"),
    dict(isim="Hampden Park",                   sehir="Glasgow",         ulke="Scotland",    kapasite=52063,  rakim=14,  cim_turu="Doğal",   lat=55.823611, lon=-4.251944,  acilis_yili=1903, boyut="105×68 m"),
    dict(isim="Johan Cruyff Arena",             sehir="Amsterdam",       ulke="Netherlands", kapasite=54990,  rakim=4,   cim_turu="Hibrit",  lat=52.314167, lon=4.941944,   acilis_yili=1996, boyut="105×68 m"),
    dict(isim="Parken Stadium",                 sehir="Copenhagen",      ulke="Denmark",     kapasite=38065,  rakim=12,  cim_turu="Doğal",   lat=55.702500, lon=12.578889,  acilis_yili=1992, boyut="105×68 m"),
    dict(isim="Arena Națională",                sehir="Bucharest",       ulke="Romania",     kapasite=55634,  rakim=70,  cim_turu="Doğal",   lat=44.438056, lon=26.041944,  acilis_yili=2011, boyut="105×68 m"),
    dict(isim="Estadio de La Cartuja",          sehir="Seville",         ulke="Spain",       kapasite=57619,  rakim=6,   cim_turu="Doğal",   lat=37.406111, lon=-5.999722,  acilis_yili=1999, boyut="105×68 m"),

    # ══════════════════════════════════════════
    # COPA AMERICA 2024 — ABD
    # ══════════════════════════════════════════
    dict(isim="AT&T Stadium",                   sehir="Arlington",       ulke="USA",         kapasite=80000,  rakim=187, cim_turu="Yapay",   lat=32.747778, lon=-97.092778, acilis_yili=2009, boyut="109×73 m"),
    dict(isim="Mercedes-Benz Stadium",          sehir="Atlanta",         ulke="USA",         kapasite=71000,  rakim=291, cim_turu="Yapay",   lat=33.755278, lon=-84.401111, acilis_yili=2017, boyut="110×75 m"),
    dict(isim="Allegiant Stadium",              sehir="Las Vegas",       ulke="USA",         kapasite=65000,  rakim=613, cim_turu="Yapay",   lat=36.090833, lon=-115.183889,acilis_yili=2020, boyut="105×68 m"),
    dict(isim="Levi's Stadium",                 sehir="Santa Clara",     ulke="USA",         kapasite=68500,  rakim=17,  cim_turu="Doğal",   lat=37.403333, lon=-121.969722,acilis_yili=2014, boyut="105×68 m"),
    dict(isim="MetLife Stadium",                sehir="East Rutherford", ulke="USA",         kapasite=82500,  rakim=8,   cim_turu="Doğal",   lat=40.813611, lon=-74.074444, acilis_yili=2010, boyut="110×75 m"),
    dict(isim="Hard Rock Stadium",              sehir="Miami",           ulke="USA",         kapasite=65326,  rakim=4,   cim_turu="Doğal",   lat=25.957940, lon=-80.238817, acilis_yili=1987, boyut="105×68 m"),
    dict(isim="NRG Stadium",                    sehir="Houston",         ulke="USA",         kapasite=72220,  rakim=17,  cim_turu="Yapay",   lat=29.684722, lon=-95.410833, acilis_yili=2002, boyut="110×75 m"),
    dict(isim="Rose Bowl",                      sehir="Pasadena",        ulke="USA",         kapasite=92542,  rakim=263, cim_turu="Doğal",   lat=34.161667, lon=-118.167778,acilis_yili=1922, boyut="105×68 m"),
    dict(isim="State Farm Stadium",             sehir="Glendale",        ulke="USA",         kapasite=63400,  rakim=323, cim_turu="Doğal",   lat=33.527500, lon=-112.262778,acilis_yili=2006, boyut="110×75 m"),
    dict(isim="Children's Mercy Park",          sehir="Kansas City",     ulke="USA",         kapasite=22000,  rakim=284, cim_turu="Doğal",   lat=39.121389, lon=-94.823333, acilis_yili=2011, boyut="105×68 m"),
]

# ─────────────────────────────────────────────────────────────────────────────
# TAKIM → EV STADYUMu HARİTASI
# DB'deki isim → stadyum ismi (yukarıdaki STADIUMS listesiyle eşleşmeli)
# ─────────────────────────────────────────────────────────────────────────────
TEAM_STADIUM = {
    # Premier League
    "Arsenal":                  "Emirates Stadium",
    "Liverpool":                "Anfield",
    "Aston Villa":              "Villa Park",
    "Bournemouth":              "Vitality Stadium",
    "Brentford":                "Gtech Community Stadium",
    "Brighton":                 "Amex Stadium",
    "Brighton & Hove Albion":   "Amex Stadium",
    "Chelsea":                  "Stamford Bridge",
    "Crystal Palace":           "Selhurst Park",
    "Everton":                  "Goodison Park",
    "Fulham":                   "Craven Cottage",
    "Ipswich Town":             "Portman Road",
    "Leicester City":           "King Power Stadium",
    "Manchester City":          "Etihad Stadium",
    "Manchester United":        "Old Trafford",
    "Newcastle":                "St James' Park",
    "Newcastle United":         "St James' Park",
    "Nottingham Forest":        "City Ground",
    "Southampton":              "St Mary's Stadium",
    "Tottenham":                "Tottenham Hotspur Stadium",
    "Tottenham Hotspur":        "Tottenham Hotspur Stadium",
    "West Ham":                 "London Stadium",
    "West Ham United":          "London Stadium",
    "Wolves":                   "Molineux Stadium",
    "Wolverhampton Wanderers":  "Molineux Stadium",
    "Leeds United":             "Elland Road",
    "Burnley":                  "Turf Moor",
    "Norwich City":             "Carrow Road",

    # Bundesliga
    "Bayern Munich":            "Allianz Arena",
    "Borussia Dortmund":        "Signal Iduna Park",
    "Bayer Leverkusen":         "BayArena",
    "RB Leipzig":               "Red Bull Arena",
    "RasenBallsport Leipzig":   "Red Bull Arena",
    "Eintracht Frankfurt":      "Deutsche Bank Park",
    "Borussia M.Gladbach":      "Borussia-Park",
    "Borussia Mönchengladbach": "Borussia-Park",
    "VfB Stuttgart":            "MHPArena",
    "Hamburger SV":             "Volksparkstadion",
    "FC Augsburg":              "WWK Arena",
    "Augsburg":                 "WWK Arena",
    "VfL Wolfsburg":            "Volkswagen Arena",
    "TSG Hoffenheim":           "PreZero Arena",
    "SC Freiburg":              "Europa-Park Stadion",
    "FC Schalke 04":            "Veltins-Arena",
    "1. FC Köln":               "RheinEnergieStadion",
    "FC Cologne":               "RheinEnergieStadion",
    "1. FSV Mainz 05":          "MEWA Arena",
    "VfL Bochum":               "Vonovia Ruhrstadion",
    "Bochum":                   "Vonovia Ruhrstadion",
    "SV Darmstadt 98":          "Merck-Stadion am Böllenfalltor",
    "Darmstadt 98":             "Merck-Stadion am Böllenfalltor",
    "Hertha BSC":               "Olympiastadion",
    "Union Berlin":             "Stadion An der Alten Försterei",
    "Werder Bremen":            "Weserstadion",

    # La Liga
    "Barcelona":                "Estadi Olímpic Lluís Companys",
    "Real Madrid":              "Santiago Bernabéu",
    "Atletico Madrid":          "Cívitas Metropolitano",
    "Atlético Madrid":          "Cívitas Metropolitano",
    "Sevilla":                  "Estadio Ramón Sánchez-Pizjuán",
    "Valencia":                 "Mestalla",
    "Villarreal":               "Estadio de la Cerámica",
    "Athletic Club":            "San Mamés",
    "Leganés":                  "Estadio Municipal de Butarque",
    "Cádiz":                    "Estadio Ramón de Carranza",
    "Real Sociedad":            "Reale Arena",
    "Espanyol":                 "RCDE Stadium",
    "Las Palmas":               "Estadio de Gran Canaria",
    "Alaves":                   "Estadio Mendizorroza",
    "Deportivo Alavés":         "Estadio Mendizorroza",
    "Celta Vigo":               "Balaídos",
    "Rayo Vallecano":           "Estadio de Vallecas",
    "Granada":                  "Estadio Nuevo Los Cármenes",
    "Almería":                  "Power Horse Stadium",
    "Elche":                    "Estadio Martínez Valero",
    "Osasuna":                  "El Sadar",

    # Serie A
    "AC Milan":                 "San Siro",
    "Inter Milan":              "San Siro",
    "Inter":                    "San Siro",
    "Juventus":                 "Allianz Stadium",
    "Napoli":                   "Stadio Diego Armando Maradona",
    "Roma":                     "Stadio Olimpico",
    "Lazio":                    "Stadio Olimpico",
    "Atalanta":                 "Gewiss Stadium",
    "Fiorentina":               "Stadio Artemio Franchi",
    "Sassuolo":                 "Mapei Stadium",
    "Genoa":                    "Stadio Luigi Ferraris",
    "Sampdoria":                "Stadio Luigi Ferraris",
    "Hellas Verona":            "Stadio Bentegodi",
    "Udinese":                  "Stadio Friuli",
    "Empoli":                   "Stadio Carlo Castellani",
    "Torino":                   "Stadio Olimpico di Torino",
    "Bologna":                  "Stadio Renato Dall'Ara",
    "Lecce":                    "Via del Mare",
    "Monza":                    "Stadio Brianteo",
    "Salernitana":              "Stadio Arechi",
    "Cagliari":                 "Unipol Domus",
    "Venezia":                  "Stadio Pier Luigi Penzo",
    "Como":                     "Stadio Giuseppe Sinigaglia",
    "Brest":                    "Stade Francis-Le Blé",

    # Ligue 1
    "Paris Saint-Germain":      "Parc des Princes",
    "PSG":                      "Parc des Princes",
    "Olympique de Marseille":   "Stade Vélodrome",
    "Marseille":                "Stade Vélodrome",
    "Lyon":                     "Groupama Stadium",
    "Olympique Lyonnais":       "Groupama Stadium",
    "AS Monaco":                "Stade Louis II",
    "Monaco":                   "Stade Louis II",
    "Lille":                    "Stade Pierre-Mauroy",
    "Nice":                     "Allianz Riviera",
    "Reims":                    "Stade Auguste-Delaune",
    "Nantes":                   "Stade de la Beaujoire",
    "Saint-Étienne":            "Stade Geoffroy-Guichard",
    "Montpellier":              "Stade de la Mosson",
    "Angers":                   "Parc des Sports",
    "Bordeaux":                 "Stade Chaban-Delmas",
    "Strasbourg":               "La Meinau",
    "Auxerre":                  "Stade de l'Abbé-Deschamps",
    "Clermont Foot":            "Stade Gabriel-Montpied",
    "AC Ajaccio":               "Stade Armand-Cesari",
    "Le Havre":                 "Stade Océane",
    "Lorient":                  "Stade du Moustoir",
    "Toulouse":                 "Stadium de Toulouse",
    "Rennes":                   "Roazhon Park",
    "Lens":                     "Stade Bollaert-Delelis",
    "Metz":                     "Stade Saint-Symphorien",
}

# ─────────────────────────────────────────────────────────────────────────────
# TURNUVA STADYUMLARı (WC/Euro'da her maçın hangi stadyumda oynandığı yoksa
# en büyük/final stadyumu gösterilir — placeholder olarak kullanılır)
# ─────────────────────────────────────────────────────────────────────────────
TOURNAMENT_DEFAULT_STADIUM = {
    "FIFA World Cup 2022":  "Lusail Stadium",
    "FIFA World Cup 2018":  "Luzhniki Stadium",
    "UEFA Euro 2024":       "Olympiastadion",
    "UEFA Euro 2020":       "Wembley Stadium",
    "Copa América 2024":    "Hard Rock Stadium",
}


def upsert_stadiums(engine) -> dict[str, int]:
    """STADIUMS listesini DB'ye yazar, {isim: id} haritası döner."""
    id_map: dict[str, int] = {}
    with engine.begin() as conn:
        for s in STADIUMS:
            row = conn.execute(text("""
                INSERT INTO stadiums
                    (isim, sehir, ulke, kapasite, rakim, cim_turu, lat, lon, acilis_yili, boyut)
                VALUES
                    (:isim, :sehir, :ulke, :kapasite, :rakim, :cim_turu, :lat, :lon, :acilis_yili, :boyut)
                ON CONFLICT (isim, ulke) DO UPDATE SET
                    sehir      = EXCLUDED.sehir,
                    kapasite   = EXCLUDED.kapasite,
                    rakim      = EXCLUDED.rakim,
                    cim_turu   = EXCLUDED.cim_turu,
                    lat        = EXCLUDED.lat,
                    lon        = EXCLUDED.lon,
                    acilis_yili= EXCLUDED.acilis_yili,
                    boyut      = EXCLUDED.boyut
                RETURNING id
            """), s)
            sid = row.scalar()
            id_map[s["isim"]] = sid
    log.info(f"  {len(STADIUMS)} stadyum upsert edildi.")
    return id_map


def build_stadium_id_map(engine) -> dict[str, int]:
    """DB'deki tüm stadyumlar için {isim: id} haritası."""
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, isim FROM stadiums")).fetchall()
    return {r[1]: r[0] for r in rows}


def link_matches(engine, stadium_map: dict[str, int]) -> dict:
    """Maçları doğru stadyuma bağlar."""
    stats = {"guncellendi": 0, "bulunamadi": 0, "turnuva": 0}

    with engine.connect() as conn:
        matches = conn.execute(text("""
            SELECT m.id, m.turnuva,
                   ev.isim AS ev_takim
            FROM matches m
            JOIN teams ev ON ev.id = m.ev_takim_id
            WHERE m.saha_id IS NULL
        """)).fetchall()

    log.info(f"  Bağlanacak maç sayısı: {len(matches)}")

    updates = []
    for mac_id, turnuva, ev_takim in matches:
        saha_id = None

        # 1) Ev takımına göre stadyum bul
        stadium_name = TEAM_STADIUM.get(ev_takim)
        if stadium_name:
            saha_id = stadium_map.get(stadium_name)

        # 2) Bulunamazsa turnuva default'u kullan
        if not saha_id:
            for prefix, stad_name in TOURNAMENT_DEFAULT_STADIUM.items():
                if turnuva and turnuva.startswith(prefix.split()[0]):
                    saha_id = stadium_map.get(stad_name)
                    if saha_id:
                        stats["turnuva"] += 1
                        break

        if saha_id:
            updates.append({"mac_id": mac_id, "saha_id": saha_id})
            stats["guncellendi"] += 1
        else:
            stats["bulunamadi"] += 1

    if updates:
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE matches SET saha_id = :saha_id WHERE id = :mac_id"
            ), updates)

    return stats


def rapor(engine) -> None:
    with engine.connect() as conn:
        total = conn.execute(text("SELECT COUNT(*) FROM matches")).scalar()
        linked = conn.execute(text("SELECT COUNT(*) FROM matches WHERE saha_id IS NOT NULL")).scalar()
        top = conn.execute(text("""
            SELECT s.isim, s.sehir, s.ulke, s.kapasite, s.rakim, COUNT(m.id) AS mac
            FROM matches m JOIN stadiums s ON s.id = m.saha_id
            GROUP BY s.id ORDER BY mac DESC LIMIT 15
        """)).fetchall()

    print(f"\nMaç bağlantısı: {linked}/{total} ({100*linked//max(total,1)}%)\n")
    print(f"{'Stadyum':<35} {'Şehir':<18} {'Ülke':<12} {'Kapasite':>9} {'Rakım':>7} {'Maç':>5}")
    print("-" * 90)
    for r in top:
        print(f"{str(r[0]):<35} {str(r[1]):<18} {str(r[2]):<12} {r[3] or 0:>9,} {r[4] or 0:>7} {r[5]:>5}")


def main():
    parser = argparse.ArgumentParser(description="Stadyum verisi + maç bağlantısı")
    parser.add_argument("--rapor",        action="store_true", help="Özet rapor")
    parser.add_argument("--sadece-bagla", action="store_true", help="Yalnızca maçları bağla")
    args = parser.parse_args()

    engine = create_engine(DATABASE_URL, pool_pre_ping=True)

    if args.rapor:
        rapor(engine)
        return

    if not args.sadece_bagla:
        log.info("Stadyumlar yükleniyor…")
        upsert_stadiums(engine)

    log.info("Maçlar stadyumlara bağlanıyor…")
    stadium_map = build_stadium_id_map(engine)
    s = link_matches(engine, stadium_map)
    log.info(f"  Güncellendi : {s['guncellendi']}")
    log.info(f"  Turnuva def.: {s['turnuva']}")
    log.info(f"  Bulunamadı  : {s['bulunamadi']}")

    log.info("\n✅ Tamamlandı.")
    rapor(engine)


if __name__ == "__main__":
    main()
