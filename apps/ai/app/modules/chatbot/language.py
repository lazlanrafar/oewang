"""Conservative conversation language selection; documents and tool output are never evidence."""
import re

LANGUAGES = {"en", "id"}
_NEUTRAL = {"ok", "okay", "yes", "ya", "y", "confirm", "confirmed", "save", "simpan", "lanjut", "cancel", "batal", "stop", "thanks", "makasih"}
_ID = set("saya aku kamu tolong beli belanja makan pengeluaran pemasukan catat berapa jumlah hari ini kemarin besok pakai dengan dari untuk ingin mau struk akun bahasa indonesia ingat memori lupakan jawab singkat rinci jangan tidak ganti gunakan hapus semua apa yang tentang ingatan".split())
_EN = set("please bought buy spent expense income record how much today yesterday tomorrow use with from for want receipt account language english remember memory forget reply concise detailed change delete all what about me my".split())


def detect_language(text: str, entity_names: list[str] | None = None) -> str | None:
    value = (text or "").strip().lower()
    if not value or value.startswith("[") or value in _NEUTRAL:
        return None
    if re.search(r"(?:bahasa|speak|reply|respond|jawab|gunakan|pakai).*\b(?:indonesia|indonesian)\b", value):
        return "id"
    if re.search(r"(?:bahasa|speak|reply|respond|jawab|gunakan|pakai).*\b(?:inggris|english)\b", value):
        return "en"
    for name in sorted(entity_names or [], key=len, reverse=True):
        value = re.sub(r"(?<!\w)" + re.escape(name.lower()) + r"(?!\w)", " ", value)
    words = set(re.findall(r"[a-z]+", value)) - _NEUTRAL
    indo, english = len(words & _ID), len(words & _EN)
    if indo >= 2 and indo >= english + 2:
        return "id"
    if english >= 2 and english >= indo + 2:
        return "en"
    return None


def resolve_language(text: str, previous: str | None = None, remembered: str | None = None,
                     workspace_default: str | None = None, entity_names: list[str] | None = None) -> str:
    default = {"english": "en", "indonesian": "id"}.get(workspace_default or "")
    return detect_language(text, entity_names) or next((v for v in (previous, remembered, default) if v in LANGUAGES), "en")


def say(language: str, english: str, indonesian: str) -> str:
    return indonesian if language == "id" else english
