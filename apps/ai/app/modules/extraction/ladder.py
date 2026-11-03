"""The extraction quality ladder (US-033b, D36, AI-10).

Most receipts are easy. A clear photograph of a supermarket receipt does
not need the most capable model, and paying for one on every upload is
waste. A crumpled thermal receipt photographed at an angle does need it.
So extraction starts cheap and escalates only on evidence
(docs/ai/service.md#extraction-quality-ladder).

```
pass 0   the PDF's own text layer, no model at all (D42)
pass 1   AI_VISION_PRIMARY, the standard prompt
pass 2   AI_VISION_SECONDARY, chain of thought, merged with pass 1
         (AI_VISION_TERTIARY instead, when pass 1 scored below half the
          threshold: there was nothing worth merging with)
pass 3   one targeted call per field still missing or invalid, at most 4
pass 4   cross-field consistency, in Rust. Here: return what exists
```

Four properties are what this module is for, and each is a line somebody
could remove without a test failing unless the test is there:

- **No tool, on any call, on any path.** `tools=[]` is passed from one
  place, `_call_model`, so there is exactly one line to get right and one
  line to assert on (D24, SEC-21). The document is text somebody else
  wrote.
- **A failed pass never aborts the ladder.** An exception, a timeout or an
  unparsable answer is a pass that produced nothing, and the next pass
  runs. Pass 2 failing falls through to pass 3.
- **The caps return a result, not an error.** Out of calls or out of
  wall-clock, the ladder stops where it is and returns what it has, marked
  by its own score and its flagged fields. A partially read receipt the
  user can correct beats a spinner that ends in a failure message.
- **Nothing here corrects a figure.** The ladder reports what the passes
  read. Arithmetic that changes a value is the API's consistency pass in
  Rust (D30, AI-7).

Nothing in this module logs a field value, a prompt, extracted text or a
document byte. The per-extraction line carries structure only: which pass,
which model, which score, which field names, how long (OPS-3).
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from datetime import date
from typing import Any

from app.config import Settings
from app.core import model
from app.modules.extraction import parsing, pdf_text, prompts
from app.modules.extraction.merging import merge_receipts, merge_statements
from app.modules.extraction.results import (
    ExtractionResult,
    ReceiptResult,
    StatementResult,
    empty_result,
    with_field,
)
from app.modules.extraction.scoring import (
    calculate_quality_score,
    low_confidence_fields,
    receipt_issues,
)

logger = logging.getLogger("oewang.ai.extraction")

#: Two full passes plus at most four targeted field calls
#: (docs/ai/service.md#budget-and-caps).
FULL_PASSES = 2
MAX_TARGETED_CALLS = 4
CALL_CAP = FULL_PASSES + MAX_TARGETED_CALLS

#: What `models` says when the answer came from the PDF's own characters
#: rather than from a model. Not a model id, and deliberately not shaped
#: like one: a cost report that counted this as a model call would be
#: wrong about the thing the ladder exists to measure.
TEXT_LAYER = "pdf-text-layer"

PDF_MEDIA_TYPE = "application/pdf"

#: The order the targeted pass works in: the field that costs the score
#: most, first. With a cap of four calls and five scorable fields, the
#: order decides which one is dropped.
TARGET_ORDER = ("total", "currency", "merchant", "date", "line_items")


@dataclass
class Outcome:
    """What one document's extraction produced.

    `passes` counts the model passes actually reached: 0 when the text
    layer answered, 1 when the cheap model was enough, up to 3. Pass 4 is
    Rust's, so it is never counted here.
    """

    result: ExtractionResult
    score: int
    low_confidence_fields: list[str]
    passes: int
    models: list[str] = field(default_factory=list)
    #: Field names the targeted pass re-asked for. Logged, not returned:
    #: the caller sees the flagged fields, which is the same information
    #: in the form the confirmation sheet needs.
    re_extracted: list[str] = field(default_factory=list)


class Unreadable(Exception):
    """Nothing usable came out of any pass (AI-3).

    `RECEIPT_UNREADABLE` for a receipt, `STATEMENT_UNREADABLE` for a
    statement. Both are a 422 in the service envelope. Raised only when
    there is genuinely nothing to confirm: a thin result is returned and
    marked, never refused (AI-11).
    """

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


@dataclass
class _Budget:
    """The two limits, and the clock they are measured against.

    One object rather than two counters, because every check needs both
    and a call that passes one and not the other must not be made.
    """

    deadline: float
    per_call_timeout: float
    calls: int = 0

    @property
    def remaining(self) -> float:
        return self.deadline - time.monotonic()

    def allows(self) -> bool:
        return self.calls < CALL_CAP and self.remaining > 0

    def timeout(self) -> float:
        """The shorter of the per-call ceiling and what is left overall.

        A 20 second call started with 3 seconds of budget left is 17
        seconds of a user watching a spinner for an answer that will be
        thrown away.
        """
        return min(self.per_call_timeout, self.remaining)


def _document_block(media_type: str, data: str) -> dict[str, Any]:
    """The image or PDF, in the Messages API's shape.

    A PDF goes as a `document` block, not an `image`: the provider renders
    its pages itself, which is one fewer thing in this service that has to
    understand a file format.
    """
    kind = "document" if media_type == PDF_MEDIA_TYPE else "image"
    return {
        "type": kind,
        "source": {"type": "base64", "media_type": media_type, "data": data},
    }


async def _call_model(
    *,
    model_id: str,
    system: str,
    media_type: str,
    data: str,
    config: Settings,
    budget: _Budget,
) -> dict[str, Any] | None:
    """One model call. Returns the parsed JSON object, or `None`.

    `None` means the pass failed: a timeout, a transport error, a provider
    error, or an answer that was not JSON. Every one of them is a pass
    that produced nothing, and the ladder continues.

    **`tools=[]` lives here and only here.** Every pass, every field,
    every path goes through this function, so the empty tool list is one
    line rather than six. The component that reads attacker-controlled
    text has nothing to call (D24, SEC-21).
    """
    budget.calls += 1
    try:
        message = await asyncio.wait_for(
            model.complete(
                model=model_id,
                max_tokens=config.ai_max_output_tokens,
                system=system,
                messages=[
                    {
                        "role": "user",
                        "content": [_document_block(media_type, data)],
                    }
                ],
                # Not a detail and not a default. See the docstring.
                tools=[],
            ),
            timeout=budget.timeout(),
        )
    except model.ModelUnavailable:
        # A misconfiguration, not a bad document. Escalating through four
        # passes to answer "unreadable" would hide it.
        raise
    except TimeoutError:
        logger.info("extraction pass on %s timed out", model_id)
        return None
    except Exception as error:
        # The type and nothing else: a provider's message can quote the
        # request, and the request is somebody's receipt (OPS-3).
        logger.info("extraction pass on %s failed with %s", model_id, type(error).__name__)
        return None

    try:
        return parsing.load_object(parsing.answer_text(message))
    except parsing.AnswerUnparsable:
        logger.info("extraction pass on %s answered outside the agreed shape", model_id)
        return None


def _parse(kind: str, body: dict[str, Any]) -> ExtractionResult:
    return parsing.parse_receipt(body) if kind == "receipt" else parsing.parse_statement(body)


def _merge(
    kind: str, first: ExtractionResult, second: ExtractionResult, today: date
) -> ExtractionResult:
    if kind == "receipt":
        assert isinstance(first, ReceiptResult) and isinstance(second, ReceiptResult)
        return merge_receipts(first, second, today=today)
    assert isinstance(first, StatementResult) and isinstance(second, StatementResult)
    return merge_statements(first, second, today=today)


def _standard_prompt(kind: str, currency: str, today: date) -> str:
    builder = prompts.receipt_standard if kind == "receipt" else prompts.statement_standard
    return builder(workspace_currency=currency, today=today)


def _deliberate_prompt(kind: str, currency: str, today: date) -> str:
    builder = (
        prompts.receipt_chain_of_thought
        if kind == "receipt"
        else prompts.statement_chain_of_thought
    )
    return builder(workspace_currency=currency, today=today)


def _text_layer_pass(kind: str, data: bytes) -> ExtractionResult | None:
    """Pass 0. The PDF's own characters, when it has any (D42)."""
    text = pdf_text.pdf_text(data)
    if text is None:
        return None
    if kind == "receipt":
        return pdf_text.parse_receipt_text(text)
    return pdf_text.parse_statement_text(text)


def _is_unreadable(kind: str, result: ExtractionResult, today: date) -> bool:
    """Is there nothing at all to confirm?

    For a receipt that is no total and no usable date: without both there
    is no transaction to draft, whatever else was read (AI-3). For a
    statement it is no valid row, which is the same statement in the shape
    a statement has.
    """
    if isinstance(result, StatementResult):
        return calculate_quality_score(result, today=today) == 0
    issues = receipt_issues(result, today)
    return {"total", "date"} <= (issues.missing | issues.invalid)


async def run_ladder(
    *,
    kind: str,
    media_type: str,
    data: str,
    raw: bytes,
    workspace_currency: str,
    today: date,
    config: Settings,
    request_id: str,
    workspace_id: str,
) -> Outcome:
    """Run the ladder over one document and return what it read.

    `data` is the base64 the caller sent, which is what goes to the model;
    `raw` is the same bytes decoded, which is what the text-layer pass
    reads. Both, rather than re-encoding one from the other, because the
    provider is handed exactly what arrived.

    Raises `Unreadable` only when nothing usable came out of any pass.
    Everything else, including a result stopped by a cap, comes back as an
    `Outcome` carrying its own score.
    """
    started = time.monotonic()
    budget = _Budget(
        deadline=started + config.ai_extraction_budget_ms / 1000,
        per_call_timeout=config.model_timeout_secs,
    )
    models: list[str] = []
    scores: list[int] = []
    threshold = config.ai_quality_threshold

    def done(result: ExtractionResult, passes: int, re_extracted: list[str]) -> Outcome:
        score = calculate_quality_score(result, today=today)
        logger.info(
            "extraction kind=%s workspace=%s request=%s reached pass %d, "
            "models %s, scores %s, re-extracted %s, %d model calls in %dms",
            kind,
            workspace_id,
            request_id,
            passes,
            models or ["none"],
            scores or ["none"],
            re_extracted or ["none"],
            budget.calls,
            int((time.monotonic() - started) * 1000),
        )
        if _is_unreadable(kind, result, today):
            raise Unreadable(
                "RECEIPT_UNREADABLE" if kind == "receipt" else "STATEMENT_UNREADABLE"
            )
        return Outcome(
            result=result,
            score=score,
            low_confidence_fields=low_confidence_fields(result, today=today),
            passes=passes,
            models=models,
            re_extracted=re_extracted,
        )

    # ------------------------------------------------- pass 0: no model
    if media_type == PDF_MEDIA_TYPE:
        from_text = _text_layer_pass(kind, raw)
        if from_text is not None:
            score = calculate_quality_score(from_text, today=today)
            if score >= threshold:
                models.append(TEXT_LAYER)
                scores.append(score)
                return done(from_text, 0, [])
            # Below the threshold the reading is discarded rather than
            # merged: it is a parser's guess at a layout, and merging a
            # weak guess with a model's reading would let a misparsed
            # label outvote a field the model read correctly.
            logger.info("the PDF text layer scored %d, below the threshold; escalating", score)

    # ------------------------------------------------- pass 1: primary
    best: ExtractionResult = empty_result(kind)
    passes = 0

    if budget.allows():
        passes = 1
        models.append(config.ai_vision_primary)
        body = await _call_model(
            model_id=config.ai_vision_primary,
            system=_standard_prompt(kind, workspace_currency, today),
            media_type=media_type,
            data=data,
            config=config,
            budget=budget,
        )
        if body is not None:
            best = _parse(kind, body)
        first_score = calculate_quality_score(best, today=today)
        scores.append(first_score)
        if body is not None and first_score >= threshold:
            return done(best, passes, [])
    else:
        first_score = 0

    # ------------------------------------------------- pass 2: escalate
    if budget.allows():
        passes = 2
        # Below half the threshold the primary did not produce something
        # worth merging with, so the step up is the full one rather than
        # the next one along. There is no separate fourth model.
        second_model = (
            config.ai_vision_tertiary
            if first_score * 2 < threshold
            else config.ai_vision_secondary
        )
        models.append(second_model)
        body = await _call_model(
            model_id=second_model,
            system=_deliberate_prompt(kind, workspace_currency, today),
            media_type=media_type,
            data=data,
            config=config,
            budget=budget,
        )
        if body is not None:
            best = _merge(kind, best, _parse(kind, body), today)
        second_score = calculate_quality_score(best, today=today)
        scores.append(second_score)
        if second_score >= threshold:
            return done(best, passes, [])

    # ------------------------------------------------- pass 3: targeted
    re_extracted: list[str] = []
    if isinstance(best, ReceiptResult):
        # Only a receipt has named fields to target. A statement's quality
        # is a share of valid rows, and "re-read row 7" is not a prompt
        # that can be written against a page the model numbers differently
        # each time, so pass 3 has nothing to do for one.
        issues = receipt_issues(best, today)
        wanted = [name for name in TARGET_ORDER if name in (issues.missing | issues.invalid)]
        targeted = 0

        for name in wanted:
            if targeted >= MAX_TARGETED_CALLS or not budget.allows():
                break
            if passes < 3:
                passes = 3
                models.append(config.ai_vision_secondary)
            targeted += 1
            body = await _call_model(
                model_id=config.ai_vision_secondary,
                system=prompts.receipt_targeted(
                    name, workspace_currency=workspace_currency, today=today
                ),
                media_type=media_type,
                data=data,
                config=config,
                budget=budget,
            )
            if body is None:
                continue
            value = parsing.parse_targeted(name, body)
            if value is None:
                continue
            candidate = with_field(best, name, value)
            # Kept only if it actually helped. A targeted call that
            # answered with something no better leaves the field alone.
            if calculate_quality_score(candidate, today=today) > calculate_quality_score(
                best, today=today
            ):
                best = candidate
                re_extracted.append(name)

        if targeted:
            scores.append(calculate_quality_score(best, today=today))

    # --------------------------------- pass 4 is Rust's (D30). Return.
    return done(best, passes, re_extracted)


__all__ = ["CALL_CAP", "MAX_TARGETED_CALLS", "Outcome", "TEXT_LAYER", "Unreadable", "run_ladder"]
