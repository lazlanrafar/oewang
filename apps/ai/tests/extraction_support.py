"""A scripted model client for the extraction tests, and the fixtures.

No test in this suite reaches a provider. The ladder's whole behaviour,
which passes it runs, what it merges, when it stops, is decided by the
answers it gets, so a script is not a stand-in for the real thing here:
it is the only way to test the thing at all. A real model would answer
differently on two runs of the same fixture.

The clock is scripted too. The wall-clock budget is a rule about
`time.monotonic`, and a test that proved it by sleeping would be a slow
test that still only proved it approximately. `FakeClock` lets an answer
say "this call took 46 seconds" and the ladder behaves exactly as it would
have.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

FIXTURES = Path(__file__).parent / "fixtures"


def fixture_text(name: str) -> str:
    """One scripted model answer, as the model would have written it."""
    return (FIXTURES / name).read_text()


def fixture_json(name: str) -> dict[str, Any]:
    return json.loads(fixture_text(name))


def fixture_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


def fixture_base64(name: str) -> str:
    import base64

    return base64.b64encode(fixture_bytes(name)).decode()


# -------------------------------------------------------------- the clock


class FakeClock:
    """A `time` stand-in with only the attribute the ladder uses.

    Installed with `monkeypatch.setattr(ladder, "time", clock)`, which
    rebinds the name inside that one module rather than touching the real
    `time`.
    """

    def __init__(self) -> None:
        self.now = 1000.0

    def monotonic(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


# ------------------------------------------------------------ the answers


@dataclass
class Answer:
    """What one scripted model call does.

    Exactly one of `text` and `error` is meaningful. `advance` moves the
    fake clock on by that many seconds before the answer comes back,
    which is how a test spends the wall-clock budget without spending it.
    """

    text: str = "{}"
    error: Exception | None = None
    advance: float = 0.0


def answer(name: str, *, advance: float = 0.0) -> Answer:
    """An answer taken from a fixture file."""
    return Answer(text=fixture_text(name), advance=advance)


def failure(error: Exception | None = None, *, advance: float = 0.0) -> Answer:
    """A pass that fails. The ladder has to carry on past it."""
    return Answer(error=error or RuntimeError("the gateway dropped the connection"),
                  advance=advance)


class Block:
    def __init__(self, text: str) -> None:
        self.type = "text"
        self.text = text


class Message:
    def __init__(self, text: str) -> None:
        self.content = [Block(text)]


class ScriptedStream:
    def __init__(self, answer: Answer, clock: FakeClock | None) -> None:
        self._answer = answer
        self._clock = clock

    async def __aenter__(self) -> ScriptedStream:
        return self

    async def __aexit__(self, *_: object) -> None:
        return None

    async def get_final_message(self) -> Message:
        if self._clock is not None and self._answer.advance:
            self._clock.advance(self._answer.advance)
        if self._answer.error is not None:
            raise self._answer.error
        return Message(self._answer.text)


@dataclass
class ScriptedMessages:
    answers: list[Answer]
    clock: FakeClock | None = None
    calls: list[dict[str, Any]] = field(default_factory=list)

    def stream(self, **kwargs: Any) -> ScriptedStream:
        self.calls.append(kwargs)
        # The last answer repeats, so a script shorter than the ladder
        # still answers every call it makes.
        index = min(len(self.calls) - 1, len(self.answers) - 1)
        return ScriptedStream(self.answers[index], self.clock)


class ScriptedClient:
    """The slice of the SDK the extraction path uses: `messages.stream`."""

    def __init__(self, *answers: Answer, clock: FakeClock | None = None) -> None:
        self.messages = ScriptedMessages(list(answers) or [Answer()], clock)

    @property
    def calls(self) -> list[dict[str, Any]]:
        return self.messages.calls

    @property
    def models(self) -> list[str]:
        return [call["model"] for call in self.calls]


def assert_no_tools(client: ScriptedClient) -> None:
    """**The control this whole path exists around** (D24, SEC-21).

    Every call the ladder makes, on every branch, passes an empty tool
    list. The component that reads attacker-controlled text has nothing
    to call, so an instruction printed on a receipt reaches a model with
    no `create_transaction` to reach for.

    Asserted on every ladder test rather than in one test of its own, so
    a new branch that forgets it fails whichever test covers that branch.
    """
    assert client.calls, "the ladder made no model call at all"
    for index, call in enumerate(client.calls):
        assert "tools" in call, f"call {index} did not pass a tool list at all"
        assert call["tools"] == [], f"call {index} carried tools: {call['tools']!r}"


__all__ = [
    "Answer",
    "FIXTURES",
    "FakeClock",
    "ScriptedClient",
    "answer",
    "assert_no_tools",
    "failure",
    "fixture_base64",
    "fixture_bytes",
    "fixture_json",
    "fixture_text",
]
