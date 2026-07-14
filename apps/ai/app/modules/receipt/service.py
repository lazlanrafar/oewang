"""Receipt OCR → structured transaction + line items. OpenAI-only port of
packages/ai/receipt/receipt.service.ts (Gemini/Claude fallbacks dropped). Vision for
images; pypdf text for PDFs. Strict JSON-schema structured output.
"""

import base64 as b64
import io
import json
import logging

from app.config import get_settings
from app.core.llm import get_client

log = logging.getLogger("ai.receipt")

_ITEM_PROPS = {
    "name": {"type": "string"},
    "brand": {"type": ["string", "null"]},
    "quantity": {"type": ["number", "null"]},
    "unit": {"type": ["string", "null"]},
    "unitPrice": {"type": ["number", "null"]},
    "amount": {"type": "number"},
    "categoryId": {"type": ["string", "null"]},
}

_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "amount": {"type": "number"},
        "date": {"type": "string"},
        "name": {"type": "string"},
        "categoryId": {"type": ["string", "null"]},
        "items": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": _ITEM_PROPS,
                "required": list(_ITEM_PROPS.keys()),
            },
        },
    },
    "required": ["amount", "date", "name", "categoryId", "items"],
}


def _system_prompt(category_context: str) -> str:
    return f"""You are an AI receipt parser. Extract the relevant financial data exactly as JSON with these keys:
{{
  "amount": number, // total amount paid
  "date": "YYYY-MM-DDTHH:mm:ss.000Z", // iso string date
  "name": string, // name of merchant or store
  "categoryId": string, // The ID of the most appropriate category for the overall transaction
  "items": [ ... line items ... ]
}}

Available Expense Categories (use these IDs for both the transaction and individual items):
{category_context or "No categories found. Return null for categoryId."}

Rules:
- Extract EVERY distinct line item from the receipt into the "items" array
- If a line item has no quantity shown, set quantity to null and unitPrice to null
- The "amount" field in items is the total for that line (quantity * unitPrice if both shown, or the line total as printed)
- Handle Currency Scale: In currencies like IDR/VND, item prices are often shorthand (e.g., "39" for 39,000). If the items sum up to roughly the total when multiplied by 1000, do so. In USD/EUR, keep the small numbers. The final item sum + taxes must roughly match the total.
- If no line items can be identified, return an empty "items" array []
- Return ONLY the JSON object, no markdown, no extra text"""


# Longest side after downscale. Matches what OpenAI's high-detail preprocessing
# keeps anyway, so this only removes bytes the API would discard — no accuracy
# cost — while bounding tile count for uncompressed web uploads.
_MAX_IMAGE_DIM = 1536


def _downscale(data_b64: str, mime_type: str) -> tuple[str, str]:
    """Resize oversized receipt photos before they hit the vision API.

    Fail-open: anything Pillow can't handle is passed through unchanged.
    """
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(b64.b64decode(data_b64)))
        if max(img.size) <= _MAX_IMAGE_DIM:
            return data_b64, mime_type
        img.thumbnail((_MAX_IMAGE_DIM, _MAX_IMAGE_DIM), Image.LANCZOS)
        buf = io.BytesIO()
        img.convert("RGB").save(buf, format="JPEG", quality=80)
        return b64.b64encode(buf.getvalue()).decode(), "image/jpeg"
    except Exception as e:  # noqa: BLE001 — never block parsing on resize
        log.warning("Image downscale failed, sending original: %s", e)
        return data_b64, mime_type


def _pdf_text(data_b64: str) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(b64.b64decode(data_b64)))
        return "\n".join((p.extract_text() or "") for p in reader.pages).strip()
    except Exception as e:  # noqa: BLE001 — any pdf failure → fall back to no text
        log.warning("PDF parse failed: %s", e)
        return ""


def parse_receipt(
    data_b64: str, mime_type: str, category_context: str
) -> tuple[dict | None, dict]:
    """Returns (ParsedReceipt dict or None, token usage) so callers can meter."""
    usage = {"input_tokens": 0, "output_tokens": 0}
    if not get_settings().OPENAI_API_KEY:
        return None, usage

    pdf_text = _pdf_text(data_b64) if mime_type == "application/pdf" else ""
    prompt = (
        f"Document text:\n{pdf_text}\n\nExtract receipt data as JSON."
        if pdf_text
        else "Extract receipt data from this image as JSON."
    )

    if pdf_text:
        content = [{"type": "text", "text": prompt}]
    else:
        data_b64, mime_type = _downscale(data_b64, mime_type)
        content = [
            {"type": "text", "text": prompt},
            {
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{data_b64}",
                    "detail": get_settings().AI_RECEIPT_DETAIL,
                },
            },
        ]

    try:
        resp = get_client().chat.completions.create(
            model=get_settings().AI_VISION_MODEL,
            max_tokens=2500,
            messages=[
                {"role": "system", "content": _system_prompt(category_context)},
                {"role": "user", "content": content},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {"name": "parsed_receipt", "strict": True, "schema": _SCHEMA},
            },
        )
        if resp.usage:
            usage = {
                "input_tokens": resp.usage.prompt_tokens,
                "output_tokens": resp.usage.completion_tokens,
            }
        return json.loads(resp.choices[0].message.content or "{}"), usage
    except Exception as e:  # noqa: BLE001
        log.error("OpenAI parseReceipt failed: %s", e)
        return None, usage
