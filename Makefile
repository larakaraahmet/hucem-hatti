# HüCem Hattı — Yardımcı Komutlar
# Kullanım: make <hedef>

.PHONY: help install dev api frontend ingest ingest-all ingest-fixtures ingest-fbref ingest-tm ingest-understat ingest-football-data schema-extend reset-db

# ── Varsayılan hedef: yardım ────────────────────────────────────────────────────
help:
	@echo ""
	@echo "  HüCem Hattı — 2026 WC Oyuncu Analiz Platformu"
	@echo ""
	@echo "  Komutlar:"
	@echo "    make install           — Python + Node bağımlılıklarını kur"
	@echo "    make dev               — API + Frontend sunucuları başlat (arka planda)"
	@echo "    make api               — Sadece FastAPI sunucusunu başlat"
	@echo "    make frontend          — Sadece Vite frontend'ini başlat"
	@echo ""
	@echo "  Veri Yükleme:"
	@echo "    make ingest            — StatsBomb verisini yükle"
	@echo "    make ingest-all        — Tüm dış kaynakları yükle (sırasıyla)"
	@echo "    make ingest-fixtures   — WC2026 fikstür takvimiini yükle / güncelle"
	@echo "    make ingest-fbref      — FBref istatistiklerini yükle (soccerdata)"
	@echo "    make ingest-tm         — Transfermarkt piyasa değerlerini yükle"
	@echo "    make ingest-understat  — Understat xG/xA trendlerini yükle"
	@echo "    make ingest-football-data — football-data.co.uk sonuç & oranlarını yükle"
	@echo ""
	@echo "  Veritabanı:"
	@echo "    make schema-extend     — Yeni tabloları DB'ye ekle (schema_additions.sql)"
	@echo "    make reset-db          — Veritabanı şemasını sıfırla (DİKKAT: veri silinir)"
	@echo ""

# ── Kurulum ────────────────────────────────────────────────────────────────────
install:
	pip install -r requirements.txt
	cd frontend && npm install

# ── Geliştirme (her ikisini birden başlat) ─────────────────────────────────────
dev:
	@echo "▶  API başlatılıyor: http://localhost:8000"
	@echo "▶  Frontend başlatılıyor: http://localhost:5173"
	uvicorn api:app --reload --host 0.0.0.0 --port 8000 &
	cd frontend && npm run dev

# ── Sadece API ─────────────────────────────────────────────────────────────────
api:
	uvicorn api:app --reload --host 0.0.0.0 --port 8000

# ── Sadece frontend ────────────────────────────────────────────────────────────
frontend:
	cd frontend && npm run dev

# ── Veri yükleme ────────────────────────────────────────────────────────────────
ingest:
	python ingest.py

# Tüm dış kaynakları sırayla yükle
ingest-all: schema-extend ingest ingest-fixtures ingest-fbref ingest-tm ingest-understat ingest-football-data
	@echo "✅ Tüm veri kaynakları yüklendi."

# WC2026 fikstür takvimi
ingest-fixtures:
	python ingest_fixtures.py --wc2026 --guncelle-durumlar

# FBref / soccerdata
ingest-fbref:
	python ingest_soccerdata.py --tum-ligler

# Transfermarkt piyasa değerleri (en aktif 150 oyuncu)
ingest-tm:
	python ingest_transfermarkt.py --min-dakika 270 --limit 150

# Understat xG/xA trendleri
ingest-understat:
	python ingest_understat.py --tum

# football-data.co.uk sonuç & oranları
ingest-football-data:
	python ingest_football_data.py --tum

# ── Şema genişletme ─────────────────────────────────────────────────────────────
schema-extend:
	@echo "▶  schema_additions.sql uygulanıyor…"
	psql -d football -f schema_additions.sql
	@echo "✅ Şema güncellendi."

# ── Veritabanı sıfırlama (DİKKATLİ KULLAN) ─────────────────────────────────────
reset-db:
	@echo "⚠️  Bu işlem tüm verileri siler!"
	@read -p "Emin misin? [evet/hayır]: " confirm; \
	if [ "$$confirm" = "evet" ]; then \
		psql -d football -f schema.sql; \
		echo "✅ Şema yeniden oluşturuldu."; \
	else \
		echo "İptal edildi."; \
	fi
