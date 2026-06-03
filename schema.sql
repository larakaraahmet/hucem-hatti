-- Futbol analiz platformu: oyuncu merkezli PostgreSQL şeması

-- Oyuncuların kimlik ve demografik bilgileri
CREATE TABLE players (
    id          SERIAL PRIMARY KEY,
    isim        VARCHAR(100) NOT NULL,
    mevki       VARCHAR(30),                  -- GK, DEF, MID, FWD
    dogum_tarihi DATE,
    milliyet    VARCHAR(60)
);

-- Turnuvaya katılan millî takımlar
CREATE TABLE teams (
    id      SERIAL PRIMARY KEY,
    isim    VARCHAR(100) NOT NULL,
    ulke    VARCHAR(60) NOT NULL
);

-- Oynanan maçlar; ev/deplasman takım referansları
CREATE TABLE matches (
    id                  SERIAL PRIMARY KEY,
    tarih               DATE NOT NULL,
    ev_takim_id         INTEGER NOT NULL REFERENCES teams(id),
    deplasman_takim_id  INTEGER NOT NULL REFERENCES teams(id),
    turnuva             VARCHAR(100),          -- ör. "2022 FIFA Dünya Kupası"
    CONSTRAINT fk_farkli_takimlar CHECK (ev_takim_id <> deplasman_takim_id)
);

-- Bir oyuncunun tek bir maçtaki istatistikleri (bileşik PK)
CREATE TABLE player_match_stats (
    oyuncu_id           INTEGER NOT NULL REFERENCES players(id),
    mac_id              INTEGER NOT NULL REFERENCES matches(id),
    dakika              SMALLINT,              -- sahada geçirilen süre
    gol                 SMALLINT    DEFAULT 0,
    asist               SMALLINT    DEFAULT 0,
    sut                 SMALLINT    DEFAULT 0,
    isabetli_sut        SMALLINT    DEFAULT 0,
    xg                  NUMERIC(5,3),          -- beklenen gol (expected goals)
    xa                  NUMERIC(5,3),          -- beklenen asist (expected assists)
    progressive_pass    SMALLINT    DEFAULT 0, -- ilerletici pas sayısı
    PRIMARY KEY (oyuncu_id, mac_id)
);

-- Her şutun koordinatı ve kalitesi; şut haritası görselleştirmesi için
CREATE TABLE shots (
    id          SERIAL PRIMARY KEY,
    oyuncu_id   INTEGER NOT NULL REFERENCES players(id),
    mac_id      INTEGER NOT NULL REFERENCES matches(id),
    x_konum     NUMERIC(5,2) NOT NULL,         -- saha koordinatı (0-120)
    y_konum     NUMERIC(5,2) NOT NULL,         -- saha koordinatı (0-80)
    xg          NUMERIC(5,3),
    gol_mu      BOOLEAN NOT NULL DEFAULT FALSE
);

-- Sık kullanılan sorgular için indeksler
CREATE INDEX idx_pms_oyuncu ON player_match_stats(oyuncu_id);
CREATE INDEX idx_pms_mac    ON player_match_stats(mac_id);
CREATE INDEX idx_shots_oyuncu ON shots(oyuncu_id);
CREATE INDEX idx_shots_mac    ON shots(mac_id);
