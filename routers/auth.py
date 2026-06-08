"""Şifre koruması ve ntfy test endpoint'leri."""

import os

from fastapi import APIRouter
from pydantic import BaseModel

from notifications import ntfy

router = APIRouter(tags=["auth"])

_SITE_PASSWORD = os.getenv("SITE_PASSWORD", "")


class LoginRequest(BaseModel):
    sifre: str


@router.get("/ntfy-test", summary="ntfy bağlantısını test eder")
def ntfy_test():
    topic = os.getenv("NTFY_TOPIC", "(boş)")
    ntfy("Test", "Hucem Hatti ntfy calisiyor!")
    return {"ntfy_topic": topic, "sent": bool(topic and topic != "(boş)")}


@router.get("/auth/ping", summary="Şifre ekranı açıldığında bildirim gönderir")
def auth_ping():
    ntfy("👀 Şifre ekranı", "Biri siteye girmeye çalışıyor")
    return {"ok": True}


@router.post("/auth/login", summary="Site şifresini doğrular")
def auth_login(req: LoginRequest):
    if not _SITE_PASSWORD:
        return {"ok": True}
    if req.sifre == _SITE_PASSWORD:
        ntfy("🔑 Doğru şifre", "Biri siteye giriş yaptı")
        return {"ok": True}
    return {"ok": False}
