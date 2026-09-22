"""Deterministic privacy controls, evaluated only against the current user message."""

import re
import time

from app.core import user_memory
from app.modules.chatbot.language import say
from app.utils.logger import get_logger

log = get_logger("ai.chatbot.memory_controls")


async def handle(
    workspace_id: str,
    user_id: str,
    text: str,
    context: dict,
    state: dict,
    language: str,
    *,
    personal: bool,
) -> str | None:
    value = text.strip().lower().rstrip(".!?")
    value = re.sub(r"^(tolong|please)\s+", "", value)
    wipe = bool(
        re.fullmatch(
            r"(hapus|lupakan) semua (memori|ingatan)( saya)?|(delete|forget|clear) all (my )?memor(?:y|ies)",
            value,
        )
    )
    confirm = value in {"konfirmasi hapus semua memori", "confirm delete all memories"}
    disable = bool(
        re.fullmatch(r"(matikan|nonaktifkan) memori|(disable|turn off) memory", value)
    )
    enable = bool(re.fullmatch(r"aktifkan memori|(enable|turn on) memory", value))
    listing = bool(
        re.fullmatch(
            r"apa yang kamu ingat( tentang saya)?|lihat memori|what do you remember( about me)?|list memor(?:y|ies)",
            value,
        )
    )
    if not any((wipe, confirm, disable, enable, listing)):
        return None
    if not personal:
        return say(
            language,
            "Personal memory is unavailable in this conversation.",
            "Memori pribadi tidak tersedia di percakapan ini.",
        )
    try:
        if wipe:
            context["memory_delete_requested_at"] = time.time()
            return say(
                language,
                "Delete all your memories across workspaces? Reply: confirm delete all memories",
                "Hapus seluruh memori Anda di semua workspace? Balas: konfirmasi hapus semua memori",
            )
        if confirm:
            requested = context.pop("memory_delete_requested_at", 0)
            if not requested or time.time() - requested > 600:
                return say(
                    language,
                    "Please request deletion of all memories first.",
                    "Silakan minta penghapusan semua memori terlebih dahulu.",
                )
            await user_memory.forget(workspace_id, user_id, all_memories=True)
            return say(
                language,
                "All your saved memories have been deleted.",
                "Seluruh memori tersimpan Anda telah dihapus.",
            )
        if disable or enable:
            await user_memory.set_enabled(workspace_id, user_id, enable)
            return say(
                language,
                "Memory enabled."
                if enable
                else "Memory disabled. Existing memories are not read or updated.",
                "Memori diaktifkan."
                if enable
                else "Memori dimatikan. Memori tersimpan tidak dibaca atau diperbarui.",
            )
        if not state["available"]:
            raise RuntimeError("unavailable")
        if not state["enabled"]:
            return say(language, "Memory is disabled.", "Memori sedang dimatikan.")
        entries = state["memories"]
        if not entries:
            return say(
                language,
                "I have no saved memories about you in this context.",
                "Belum ada memori tersimpan tentang Anda dalam konteks ini.",
            )
        return (
            say(language, "Your saved memories:", "Memori tersimpan Anda:")
            + "\n"
            + "\n".join(f"- {m['memory_key']}: {m['value']}" for m in entries)
        )
    except RuntimeError:
        log.warning(
            "memory_controls: state unavailable for workspace=%s user=%s",
            workspace_id,
            user_id,
        )
        return say(
            language,
            "Memory is temporarily unavailable. No change was confirmed.",
            "Memori sementara tidak tersedia. Perubahan belum dapat dikonfirmasi.",
        )
    except Exception:
        log.warning("memory_controls: unexpected error", exc_info=True)
        return say(
            language,
            "Memory is temporarily unavailable. No change was confirmed.",
            "Memori sementara tidak tersedia. Perubahan belum dapat dikonfirmasi.",
        )
