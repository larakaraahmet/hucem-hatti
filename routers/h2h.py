"""H2H ve AI yorum endpoint'leri."""

import os

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Engine

from db import get_engine
from ingest_openfootball import h2h_compute

router = APIRouter(tags=["h2h"])


@router.get("/h2h/commentary", summary="İki takım için AI maç yorumu")
def h2h_commentary(
    takim1:   str  = Query(...),
    takim2:   str  = Query(...),
    takim1Tr: str  = Query(""),
    takim2Tr: str  = Query(""),
    ilk_kez:  bool = Query(True),
):
    try:
        import anthropic as _ant
    except ImportError:
        return {"yorum": "AI yorum şu an aktif değil."}

    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        return {"yorum": "AI yorum şu an aktif değil."}

    t1 = takim1Tr or takim1
    t2 = takim2Tr or takim2
    context = (
        f"{t1} ve {t2} bu turnuvada ilk kez karşı karşıya geliyor — aralarında WC/Euro geçmişi yok."
        if ilk_kez else
        f"{t1} ile {t2} daha önce çok az karşılaşmış."
    )
    prompt = (
        f"{context}\n\n2026 FIFA Dünya Kupası bağlamında bu iki millî takımı kısaca analiz et. "
        f"Her takımın genel oyun tarzını, güçlü yönlerini, öne çıkan oyuncularını ve "
        f"bu karşılaşmada belirleyici olabilecek faktörleri Türkçe, samimi ve "
        f"net bir dille 3-4 cümleyle açıkla. Rakam veya istatistik uydurmadan, "
        f"genel futbol bilgisine dayanan bir yorum yap."
    )
    try:
        client = _ant.Anthropic(api_key=api_key)
        msg = client.messages.create(
            model="claude-haiku-4-5",
            max_tokens=350,
            messages=[{"role": "user", "content": prompt}],
        )
        return {"yorum": msg.content[0].text.strip()}
    except Exception as e:
        return {"yorum": f"Yorum üretilemedi: {str(e)[:80]}"}


@router.get("/h2h", summary="İki takım arasındaki WC geçmişi")
def head_to_head(
    takim1:    str   = Query(...),
    takim2:    str   = Query(...),
    normalize: bool  = Query(True),
    min_yil:   int   = Query(1930),
    max_yil:   int   = Query(2026),
    engine:    Engine = Depends(get_engine),
):
    try:
        result = h2h_compute(engine, takim1, takim2, normalize=normalize, min_yil=min_yil, max_yil=max_yil)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"H2H hesaplama hatası: {e}")

    result["tum_maclar"] = [
        {k: str(v) if hasattr(v, "isoformat") else v for k, v in m.items()}
        for m in result["tum_maclar"]
    ]
    if result.get("son_5"):
        result["son_5"] = [
            {k: str(v) if hasattr(v, "isoformat") else v for k, v in m.items()}
            for m in result["son_5"]
        ]
    return result
