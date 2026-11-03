"""The service's own Ed25519 signing key."""

from __future__ import annotations

import stat

import pytest

from app.core import owe1
from app.core.signer import Signer, SignerError


def test_a_created_key_is_private(tmp_path) -> None:
    path = tmp_path / "nested" / "owe1-signing-key.pem"
    signer = Signer.load_or_create(path, allow_create=True)

    assert stat.S_IMODE(path.stat().st_mode) == 0o600
    assert signer.key_id.startswith("k-")


def test_a_key_is_loaded_rather_than_replaced(tmp_path) -> None:
    path = tmp_path / "owe1-signing-key.pem"
    first = Signer.load_or_create(path, allow_create=True)
    second = Signer.load_or_create(path, allow_create=False)

    assert first.key_id == second.key_id


def test_creating_a_key_outside_development_is_refused(tmp_path) -> None:
    """Generating one automatically would silently invalidate every pinned
    client on a fresh deployment."""
    with pytest.raises(SignerError, match="secret store"):
        Signer.load_or_create(tmp_path / "missing.pem", allow_create=False)


def test_a_malformed_key_file_is_refused(tmp_path) -> None:
    path = tmp_path / "owe1-signing-key.pem"
    path.write_text("not a pem")
    with pytest.raises(SignerError):
        Signer.load_or_create(path, allow_create=True)


def test_a_signature_verifies_against_the_published_key(tmp_path) -> None:
    signer = Signer.load_or_create(tmp_path / "k.pem", allow_create=True)
    message = b"oewang/owe1/handshake-ish"

    owe1.verify_handshake(signer.public_key(), signer.sign(message), message)

    with pytest.raises(owe1.Owe1Error):
        owe1.verify_handshake(signer.public_key(), signer.sign(message), message + b"!")


def test_the_private_half_never_prints(tmp_path) -> None:
    signer = Signer.load_or_create(tmp_path / "k.pem", allow_create=True)
    assert "PRIVATE" not in repr(signer)
    assert signer.key_id in repr(signer)
