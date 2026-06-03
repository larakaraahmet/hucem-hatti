"""
LLM tabanlı oyuncu içgörü üreticisi.
Anthropic API ile oyuncunun per-90 metrikleri ve yüzdelik dilimlerinden
Türkçe, veri odaklı 2-3 cümlelik içgörüler üretir.
Sistem promptu prompt caching ile önbelleklenir.
"""

import os
from typing import Any

import anthropic
from sqlalchemy import Engine

from metrics import get_player_metrics

# ---------------------------------------------------------------------------
# İstemci
# ---------------------------------------------------------------------------
_client: anthropic.Anthropic | None = None


def _get_client() -> anthropic.Anthropic:
    global _client
    if _client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY ortam değişkeni tanımlı değil.")
        _client = anthropic.Anthropic(api_key=api_key)
    return _client


MODEL = "claude-opus-4-7"

# ---------------------------------------------------------------------------
# Sistem promptu — tüm oyuncular için aynıdır, önbelleklenir.
# Futbol metriklerinin ayrıntılı açıklamaları hem cache eşiğini hem de
# içgörü kalitesini artırır.
# ---------------------------------------------------------------------------
_SYSTEM = """Sen dünya standartlarında bir futbol veri analistisisin. Görevin,
sana verilen oyuncu istatistiklerini derinlemesine analiz ederek Türkçe, kısa
ve dikkat çekici içgörüler üretmektir.

─── METRİK SÖZLÜĞÜ ────────────────────────────────────────────────────────────

xG/90  (Expected Goals per 90 minutes — Beklenen Gol)
  Bir oyuncunun 90 dakikada ürettiği toplam şut kalitesinin istatistiksel
  tahmini. Her şuta, tarihsel verilerden elde edilen "o şutun gol olma
  olasılığı" (0.0–1.0) atanır; bu değerlerin toplamı xG'yi oluşturur.
  xG/90 > 0.40: turnuvanın en tehlikeli oyuncuları.
  xG/90 > 0.70: son derece nadir, çeyrek finalist takımların yıldızları.

Gol/90  (Goals per 90 minutes — Gerçek Gol)
  Gerçek gol sayısını 90 dakikaya normalleştirir.
  xG/90 ile karşılaştırıldığında:
  • Gol/90 >> xG/90 → olağandışı klinik bitiricilik (örn. 0.80 gol/90 ama
    yalnızca 0.45 xG/90); sürdürülebilirlik tartışmalıdır.
  • Gol/90 << xG/90 → şanssız bitiricilik ya da kaleci kurtarışları yüksek;
    istatistiksel geri dönüş beklenir.

xA/90  (Expected Assists per 90 minutes — Beklenen Asist)
  Bir oyuncunun verdiği pasların gol üretme olasılığının 90 dakika başına
  değeri. Yalnızca asist sayılmayan ama tehlike yaratan pasları da kapsar.
  xA/90 > 0.25: turnuvanın en yaratıcı pasörleri.

Asist/90  (Gerçek Asist)
  xA/90 ile karşılaştırıldığında fırsatları değerlendirme etkinliğini
  gösterir. Gol/90 gibi, gerçek asistler şansa daha fazla bağlıdır.

Şut/90  (Shots per 90 minutes)
  Baskı hacmini ölçer; isabetli şutlarla birlikte değerlendirilmelidir.
  Şut/90 yüksek ama xG/90 düşük → büyük ihtimalle uzaktan, düşük kaliteli
  şutlar.

İsabetli Şut/90  (Shots on Target per 90 minutes)
  Kaleciye yönelik şutlar. İsabetli oran = isabetli/toplam; %40+ kaliteli
  şut seçimi anlamına gelir.

Prog. Pas/90  (Progressive Passes per 90 minutes — İlerletici Pas)
  StatsBomb tanımı: rakip kaleye mesafeyi en az 32 yard (≈29 m) azaltan pas.
  Baskı kurmayı ve maç temposunu taşıyan oyuncuları ayırt eder.
  Defansif oyuncular için 7–10/90, orta saha için 10–14/90 üzeri dikkat
  çekici; yüksek rakam oyunu organize eden bir konum anlamına gelir.

Yüzdelik Dilim (Percentile)
  0–100 arası değer; oyuncunun ilgili metrikte turnuvadaki tüm oyuncular
  (min 90 dak.) içindeki göreceli konumunu gösterir.
  • 90+ → turnuvanın en iyisi %10
  • 75–90 → üst çeyrek
  • 50 → tam ortanca
  • 25 altı → alt çeyrek

─── ÇIKTI KURALLARI ────────────────────────────────────────────────────────────

1. YALNIZCA sana verilen sayısal verilere dayan. Tahmin etme, uydurma veya
   genel futbol bilgisinden yararlanma; oyuncu hakkında meşhur sahnelere,
   başka turnuvalara ya da duyumlara atıfta bulunma.

2. Çıktın TÜRKÇE ve tam olarak 2–3 cümle uzunluğunda olsun. Ne daha az,
   ne daha fazla.

3. En az bir somut istatistiği (rakamıyla birlikte) ver. Belirsiz,
   yuvarlak ifadeler kullanma.

4. Varsa ilginç bir çelişkiyi, gizli kaliteyi veya dikkat çekici
   örüntüyü öne çıkar. Örnek çelişkiler:
   • Gol/90 düşük ama xG/90 çok yüksek → yaratıyor ama finişlemde şanssız
   • Şut/90 yüksek ama isabetli oran düşük → hacim odaklı ama kalitesiz
   • xA/90 yüksek ama asist yüzdeliki orta → takım arkadaşları fırsatı kaçırıyor
   • Prog. pas/90 çok yüksek → forvet pozisyonuna rağmen oyun kurucuya benziyor

5. Yüzdelik dilimler 90 üzerindeyse "turnuvanın en iyileri arasında",
   50 civarındaysa "turnuva ortalamasında" gibi bağlamsal ifadeler kullan.

6. Eğer oyuncu verisi yetersiz görünüyorsa (tüm metrikler 0 veya null) ya da
   anlamsızsa bunu doğrudan belirt; yorum üretmeye zorlanma.

7. Oyuncunun adına cümlede yer ver; "o" veya "bu oyuncu" deme.

─── ÖNEMLİ ─────────────────────────────────────────────────────────────────────

Yüzdelik dilim ve ham değerleri birlikte yorumla; yalnızca biri yeterli değildir.
Çıktı bir ürün arayüzünde görünecek; profesyonel, özlü ve veriye dayalı ol."""


# ---------------------------------------------------------------------------
# Veri biçimlendirici
# ---------------------------------------------------------------------------

def _format_metrics(metrics: dict[str, Any]) -> str:
    """Metrik sözlüğünü LLM'in kolayca okuyacağı düz metne dönüştürür."""
    p90 = metrics["per90"]
    pct = metrics["percentile"]

    lines = [
        f"Oyuncu : {metrics['isim']}",
        f"Mevki  : {metrics.get('mevki') or 'Belirtilmemiş'}",
        f"Süre   : {metrics['toplam_dakika']} dk | {metrics['mac_sayisi']} maç",
        "",
        "Metrik             Ham (per-90)   Yüzdelik Dilim",
        "─" * 52,
        f"xG/90              {p90['xg90']:>8.3f}         %{pct['xg90']:>5.1f}",
        f"Gol/90             {p90['gol90']:>8.3f}         %{pct['gol90']:>5.1f}",
        f"xA/90              {p90['xa90']:>8.3f}         %{pct['xa90']:>5.1f}",
        f"Asist/90           {p90['asist90']:>8.3f}         %{pct['asist90']:>5.1f}",
        f"Şut/90             {p90['sut90']:>8.3f}         %{pct['sut90']:>5.1f}",
        f"İsabetli Şut/90    {p90['isabetli90']:>8.3f}         %{pct['isabetli90']:>5.1f}",
        f"Prog. Pas/90       {p90['prog_pass90']:>8.3f}         %{pct['prog_pass90']:>5.1f}",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Ana fonksiyon
# ---------------------------------------------------------------------------

def generate_insight(
    metrics: dict[str, Any],
    *,
    max_tokens: int = 300,
) -> tuple[str, dict[str, int]]:
    """
    Oyuncu metriklerinden Türkçe içgörü üretir.

    Args:
        metrics:    get_player_metrics() çıktısı
        max_tokens: maksimum çıktı uzunluğu (token)

    Returns:
        (içgörü metni, kullanım istatistikleri)
        kullanım: cache_creation, cache_read, input, output token sayıları
    """
    client = _get_client()
    player_data = _format_metrics(metrics)

    response = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=[
            {
                "type": "text",
                "text": _SYSTEM,
                # Sistem promptu tüm oyuncular için sabittir; önbelleğe alınır.
                "cache_control": {"type": "ephemeral"},
            }
        ],
        messages=[
            {
                "role": "user",
                "content": (
                    "Aşağıdaki oyuncu verisini analiz et ve kurallara uygun "
                    "2–3 cümlelik Türkçe içgörü üret:\n\n"
                    + player_data
                ),
            }
        ],
    )

    text = response.content[0].text.strip()
    usage = {
        "cache_creation_tokens": response.usage.cache_creation_input_tokens or 0,
        "cache_read_tokens":     response.usage.cache_read_input_tokens or 0,
        "input_tokens":          response.usage.input_tokens,
        "output_tokens":         response.usage.output_tokens,
    }
    return text, usage


def generate_insight_for_player(
    player_id: int,
    engine: Engine,
    min_minutes: int = 90,
) -> dict[str, Any]:
    """
    Veritabanından metrik çekip içgörü üretir.

    Returns:
        {
          "oyuncu_id": int,
          "isim": str,
          "insight": str,
          "usage": { cache_creation_tokens, cache_read_tokens,
                     input_tokens, output_tokens }
        }
    """
    metrics = get_player_metrics(player_id, engine, min_minutes=min_minutes)
    insight, usage = generate_insight(metrics)
    return {
        "oyuncu_id": player_id,
        "isim":      metrics["isim"],
        "insight":   insight,
        "usage":     usage,
    }
