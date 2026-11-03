"""The AI service's long-term Ed25519 signing key.

The API pins this public key and verifies every handshake against it. A
client that cannot verify stops; it never falls back to plaintext. The Rust
counterpart is apps/api/crates/server/src/owe1/signer.rs, and both follow
docs/api/encryption.md#server-signing-keys.
"""

from __future__ import annotations

import os
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from app.core import owe1


class SignerError(Exception):
    """The key is missing, unreadable or not an Ed25519 key."""


class Signer:
    def __init__(self, key: Ed25519PrivateKey) -> None:
        self._key = key
        self._public = key.public_key().public_bytes(
            encoding=serialization.Encoding.Raw,
            format=serialization.PublicFormat.Raw,
        )
        self.key_id = owe1.key_id(self._public)

    def __repr__(self) -> str:  # the private half never prints (OPS-3)
        return f"Signer(key_id={self.key_id!r})"

    @classmethod
    def load_or_create(cls, path: Path, allow_create: bool) -> Signer:
        """Load the key, creating it on first start in development only.

        Generating a key automatically in production would silently
        invalidate every pinned client on a fresh deployment, so that path
        refuses instead.
        """
        if path.exists():
            try:
                key = serialization.load_pem_private_key(path.read_bytes(), password=None)
            except Exception as exc:  # noqa: BLE001 - any parse failure is the same failure
                raise SignerError(f"{path} is not a valid PKCS#8 private key") from exc
            if not isinstance(key, Ed25519PrivateKey):
                raise SignerError(f"{path} is not an Ed25519 private key")
            return cls(key)

        if not allow_create:
            raise SignerError(
                f"refusing to create a signing key outside development; "
                f"mount {path} from the secret store"
            )

        key = Ed25519PrivateKey.generate()
        pem = key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        path.parent.mkdir(parents=True, exist_ok=True)
        # Created 0600 and written in one step, so the bytes are never
        # readable by anyone else, not even briefly.
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(descriptor, "wb") as handle:
            handle.write(pem)

        return cls(key)

    def public_key(self) -> bytes:
        return self._public

    def sign(self, message: bytes) -> bytes:
        return self._key.sign(message)
