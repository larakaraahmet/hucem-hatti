-- HüCem Hattı — Genişletilmiş Şema
-- Mevcut schema.sql'e ek tablolar.
-- Çalıştır: psql -d football -f schema_additions.sql

-- ─── socceraction: xT / action-value metrikleri ──────────────────────────────
CREATE TABLE IF NOT EXISTS player_xt_stats (
    oyuncu_id       INTEGER NOT NULL REFERENCES players(id),
    mac_id          INTEGER NOT NULL REFERENCES matches(id),
    xt_toplam       NUMERIC(9,5),        -- toplam xT katkısı
    xt_ofansif      NUMERIC(9,5),        -- hücum xT (taşıma + pas)
    xt_defansif     NUMERIC(9,5),        -- savunma xT (top çalma, araya girme)
    action_value    NUMERIC(9,5),        -- toplam action value (VAEP benzeri)
    tasima_xt       NUMERIC(9,5),        -- carry xT
    pas_xt          NUMERIC(9,5),        -- pass xT
    sut_xt          NUMERIC(9,5),        -- shot xT
    dakika          SMALLINT,
    kaynak          VARCHAR(20) DEFAULT 'socceraction',
    guncelleme      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (oyuncu_id, mac_id)
);

-- ─── FBref / soccerdata: sezonluk aggregate istatistikler ─────────────────────
CREATE TABLE IF NOT EXISTS player_external_stats (
    id              SERIAL PRIMARY KEY,
    oyuncu_id       INTEGER REFERENCES players(id),
    external_isim   VARCHAR(150),        -- FBref'teki isim (eşleştirme için)
    sezon           VARCHAR(10),         -- ör. "2023-24"
    lig             VARCHAR(60),
    takim           VARCHAR(100),
    mac_sayisi      SMALLINT,
    dakika          INTEGER,
    gol             SMALLINT DEFAULT 0,
    asist           SMALLINT DEFAULT 0,
    -- Şut
    sut             SMALLINT DEFAULT 0,
    isabetli_sut    SMALLINT DEFAULT 0,
    xg              NUMERIC(7,3),
    xg_katki        NUMERIC(7,3),        -- xG + xA
    -- Pas
    pas_tamamlanan  INTEGER DEFAULT 0,
    pas_denenen     INTEGER DEFAULT 0,
    ileri_pas       SMALLINT DEFAULT 0,
    pas_mesafesi_m  INTEGER DEFAULT 0,   -- metre (1 yard = 0.9144 m)
    -- Taşıma (carry)
    surus           SMALLINT DEFAULT 0,
    surus_mesafesi_m INTEGER DEFAULT 0,  -- metre
    ileri_surus     SMALLINT DEFAULT 0,
    -- Savunma
    tackle          SMALLINT DEFAULT 0,
    tackle_kazanma  SMALLINT DEFAULT 0,
    araya_girme     SMALLINT DEFAULT 0,
    blok            SMALLINT DEFAULT 0,
    baski           SMALLINT DEFAULT 0,
    baski_basarili  SMALLINT DEFAULT 0,
    top_kazanma     SMALLINT DEFAULT 0,
    -- Serbest alan / yaratma
    driblel_basarili SMALLINT DEFAULT 0,
    driblel_denenen  SMALLINT DEFAULT 0,
    kilit_pas       SMALLINT DEFAULT 0,
    son_ucte_giris  SMALLINT DEFAULT 0,
    son_ucte_pas    SMALLINT DEFAULT 0,
    -- Meta
    kaynak          VARCHAR(30) DEFAULT 'fbref',
    guncelleme      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(oyuncu_id, sezon, lig)
);

-- ─── Transfermarkt: piyasa değeri ve kulüp bilgisi ───────────────────────────
CREATE TABLE IF NOT EXISTS player_market_values (
    id              SERIAL PRIMARY KEY,
    oyuncu_id       INTEGER REFERENCES players(id),
    external_isim   VARCHAR(150),
    yas             SMALLINT,
    kulup           VARCHAR(100),
    piyasa_degeri   BIGINT,             -- EUR cinsinden
    piyasa_para_b   VARCHAR(10) DEFAULT 'EUR',
    sozlesme_bitis  DATE,
    pozisyon        VARCHAR(60),
    tm_profil_url   TEXT,
    kaynak          VARCHAR(30) DEFAULT 'transfermarkt',
    guncelleme      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(oyuncu_id)
);

-- ─── Understat: historical xG/xA trendleri ───────────────────────────────────
CREATE TABLE IF NOT EXISTS player_xg_trends (
    id              SERIAL PRIMARY KEY,
    oyuncu_id       INTEGER REFERENCES players(id),
    external_isim   VARCHAR(150),
    sezon           VARCHAR(10),
    lig             VARCHAR(60),
    mac_sayisi      SMALLINT,
    dakika          INTEGER,
    gol             SMALLINT,
    xg              NUMERIC(7,3),
    asist           SMALLINT,
    xa              NUMERIC(7,3),
    xg_zincir       NUMERIC(7,3),
    xg_yaratma      NUMERIC(7,3),
    kaynak          VARCHAR(30) DEFAULT 'understat',
    guncelleme      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(oyuncu_id, sezon, lig)
);

-- ─── Fikstür takvimi ─────────────────────────────────────────────────────────
-- tarih_utc UTC'de saklanır; TR saati için AT TIME ZONE 'Europe/Istanbul'
CREATE TABLE IF NOT EXISTS fixtures (
    id                  SERIAL PRIMARY KEY,
    turnuva             VARCHAR(100) NOT NULL,
    sezon               VARCHAR(10),
    tur                 VARCHAR(60),           -- Grup, Son 32, Çeyrek Final, Final…
    grup                VARCHAR(5),            -- A, B, C, …
    hafta               SMALLINT,              -- maç günü / hafta no
    ev_takim            VARCHAR(100),
    dep_takim           VARCHAR(100),
    tarih_utc           TIMESTAMP WITH TIME ZONE NOT NULL,
    stadyum_isim        VARCHAR(150),
    stadyum_sehir       VARCHAR(80),
    stadyum_ulke        VARCHAR(60),
    stadyum_kapasite    INTEGER,
    durum               VARCHAR(20) DEFAULT 'programlı',
    -- durum: programlı | canlı | skor_bekleniyor | oynandı | ertelendi | iptal
    ev_gol              SMALLINT,
    dep_gol             SMALLINT,
    sonuc               VARCHAR(10),           -- ev | dep | beg
    muhtemel_kadro_ev   JSONB,                 -- {"sistem":"4-3-3","oyuncular":[...]}
    muhtemel_kadro_dep  JSONB,
    teknik_detaylar     JSONB DEFAULT '{}',    -- hakem, hava, çim tipi vb.
    kaynak              VARCHAR(30),
    guncelleme          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(turnuva, sezon, ev_takim, dep_takim, tarih_utc)
);

-- ─── Maç sonuçları (football-data.co.uk) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_results (
    id          SERIAL PRIMARY KEY,
    turnuva     VARCHAR(60),
    sezon       VARCHAR(10),
    mac_tarihi  DATE,
    ev_sahibi   VARCHAR(100),
    deplasman   VARCHAR(100),
    ev_gol      SMALLINT,
    dep_gol     SMALLINT,
    sonuc       VARCHAR(5),     -- E (ev), B (beraberlik), D (deplasman)
    kaynak      VARCHAR(30) DEFAULT 'football-data',
    guncelleme  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(turnuva, sezon, mac_tarihi, ev_sahibi, deplasman)
);

-- ─── Bahis oranları (football-data.co.uk) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS betting_odds (
    id          SERIAL PRIMARY KEY,
    turnuva     VARCHAR(60),
    sezon       VARCHAR(10),
    mac_tarihi  DATE,
    ev_sahibi   VARCHAR(100),
    deplasman   VARCHAR(100),
    -- Bet365
    b365_ev     NUMERIC(7,3),
    b365_beg    NUMERIC(7,3),
    b365_dep    NUMERIC(7,3),
    -- BetWay
    bw_ev       NUMERIC(7,3),
    bw_beg      NUMERIC(7,3),
    bw_dep      NUMERIC(7,3),
    -- Pinnacle
    ps_ev       NUMERIC(7,3),
    ps_beg      NUMERIC(7,3),
    ps_dep      NUMERIC(7,3),
    kaynak      VARCHAR(30) DEFAULT 'football-data',
    guncelleme  TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(turnuva, sezon, mac_tarihi, ev_sahibi, deplasman)
);

-- ─── İndeksler ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_xt_oyuncu      ON player_xt_stats(oyuncu_id);
CREATE INDEX IF NOT EXISTS idx_ext_oyuncu     ON player_external_stats(oyuncu_id);
CREATE INDEX IF NOT EXISTS idx_ext_sezon      ON player_external_stats(sezon, lig);
CREATE INDEX IF NOT EXISTS idx_market_oyuncu  ON player_market_values(oyuncu_id);
CREATE INDEX IF NOT EXISTS idx_trend_oyuncu   ON player_xg_trends(oyuncu_id);
CREATE INDEX IF NOT EXISTS idx_fix_tarih      ON fixtures(tarih_utc);
CREATE INDEX IF NOT EXISTS idx_fix_turnuva    ON fixtures(turnuva, tur);
CREATE INDEX IF NOT EXISTS idx_fix_durum      ON fixtures(durum, tarih_utc);
CREATE INDEX IF NOT EXISTS idx_mr_turnuva     ON match_results(turnuva, sezon);
CREATE INDEX IF NOT EXISTS idx_odds_mac       ON betting_odds(turnuva, sezon, mac_tarihi);

-- ─── Yardımcı view: TR saatle fikstür ────────────────────────────────────────
CREATE OR REPLACE VIEW fixtures_tr AS
SELECT
    id,
    turnuva,
    sezon,
    tur,
    grup,
    hafta,
    ev_takim,
    dep_takim,
    (tarih_utc AT TIME ZONE 'Europe/Istanbul')  AS tarih_tr,
    tarih_utc,
    stadyum_isim,
    stadyum_sehir,
    stadyum_ulke,
    stadyum_kapasite,
    durum,
    ev_gol,
    dep_gol,
    sonuc,
    muhtemel_kadro_ev,
    muhtemel_kadro_dep,
    teknik_detaylar,
    guncelleme
FROM fixtures
ORDER BY tarih_utc;
