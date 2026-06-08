"""ntfy.sh push bildirimleri ve rate-limit state."""

import os
import time
import urllib.parse
import urllib.request

_NTFY_TOPIC = os.getenv("NTFY_TOPIC", "")

_state: dict = {
    "last_notif_search": "",
    "last_visit_time": 0.0,
    "last_player_notif": {},  # player_id → timestamp
}


def ntfy(baslik: str, mesaj: str) -> None:
    """ntfy.sh üzerinden push bildirim gönderir. Hata olursa sessizce geçer."""
    if not _NTFY_TOPIC:
        return
    try:
        payload = mesaj.encode("utf-8")
        safe_title = baslik.encode("ascii", errors="ignore").decode("ascii")
        req = urllib.request.Request(
            f"https://ntfy.sh/{_NTFY_TOPIC}",
            data=payload,
            headers={
                "Content-Type": "text/plain; charset=utf-8",
                "Title": safe_title,
            },
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass


def notify_player_view(player_id: int, isim: str, mevki: str | None, milliyet: str | None) -> None:
    """60 saniye cooldown ile oyuncu profil açılışı bildirir."""
    now = time.time()
    player_notifs: dict = _state["last_player_notif"]
    if now - player_notifs.get(player_id, 0) > 60:
        player_notifs[player_id] = now
        detay = " | ".join(filter(None, [mevki, milliyet]))
        ntfy(f":( {isim}", detay if detay else "profil acildi")


def notify_search(q: str) -> None:
    if q and q.lower() != "ping" and q != _state["last_notif_search"]:
        _state["last_notif_search"] = q
        ntfy(":( arama", f'"{q}"')


def notify_visit() -> None:
    ntfy(":( ziyaret", "biri girdi")
