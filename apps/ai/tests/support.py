"""An OWE1 client for the tests, mirroring the Rust and Node ones.

It does the client half of the protocol against a `TestClient`: handshake,
verify the signature against the published key, derive the two keys, then
seal every request and open every response. Written out rather than mocked,
because what these tests are for is the wire contract.
"""

from __future__ import annotations

import json
import os
import secrets
from dataclasses import dataclass, field

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.x25519 import X25519PrivateKey
from fastapi.testclient import TestClient

from app.core import owe1


@dataclass
class Owe1TestClient:
    http: TestClient
    api_key: str
    session_id: str = ""
    keys: owe1.SessionKeys | None = None
    pinned: dict[str, bytes] = field(default_factory=dict)

    def pin_keys(self) -> None:
        published = self.http.get("/.well-known/oewang-keys").json()
        self.pinned = {entry["kid"]: owe1.unb64(entry["public_key"]) for entry in published}

    def handshake(self) -> dict:
        if not self.pinned:
            self.pin_keys()

        private = X25519PrivateKey.generate()
        public = private.public_key().public_bytes(
            encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw
        )
        client_nonce = os.urandom(16)

        response = self.http.post(
            "/v1/handshake",
            headers={"x-api-key": self.api_key},
            json={
                "v": owe1.VERSION,
                "client_public_key": owe1.b64(public),
                "client_nonce": owe1.b64(client_nonce),
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()

        # Verify or stop. Never fall back to plaintext.
        owe1.verify_handshake(
            self.pinned[body["kid"]],
            owe1.unb64(body["signature"]),
            owe1.transcript(
                public,
                owe1.unb64(body["server_public_key"]),
                client_nonce,
                owe1.unb64(body["server_nonce"]),
                body["session_id"],
                body["expires_at"],
                body["server_time"],
            ),
        )

        self.session_id = body["session_id"]
        self.keys = owe1.derive_keys(
            private,
            owe1.unb64(body["server_public_key"]),
            client_nonce,
            owe1.unb64(body["server_nonce"]),
            body["session_id"],
        )
        return body

    def request(
        self,
        method: str,
        path: str,
        *,
        body: object | None = None,
        query: str = "",
        request_id: str | None = None,
        timestamp: int | None = None,
        session_id: str | None = None,
        plaintext_query: str = "",
    ):
        assert self.keys is not None, "handshake first"
        session = session_id or self.session_id
        request_id = request_id or secrets.token_hex(12).upper()
        timestamp = owe1.now_secs() if timestamp is None else timestamp

        headers = {
            "x-api-key": self.api_key,
            "content-type": owe1.CONTENT_TYPE,
            "x-owe-session": session,
            "x-owe-request-id": request_id,
            "x-owe-timestamp": str(timestamp),
            "x-owe-query": owe1.seal_field(
                self.keys.client_to_server,
                owe1.aad_query(session, method, path, request_id, timestamp),
                query.encode(),
            ),
        }

        content = None
        if body is not None:
            content = json.dumps(
                owe1.seal(
                    self.keys.client_to_server,
                    owe1.aad_request(session, method, path, request_id, timestamp),
                    json.dumps(body).encode(),
                )
            )

        url = f"{path}?{plaintext_query}" if plaintext_query else path
        response = self.http.request(method, url, headers=headers, content=content)
        return response, request_id

    def open_response(self, response, request_id: str, session_id: str | None = None) -> dict:
        assert self.keys is not None
        plaintext = owe1.open_sealed(
            self.keys.server_to_client,
            owe1.aad_response(session_id or self.session_id, request_id, response.status_code),
            response.json(),
        )
        return json.loads(plaintext)

    def call(self, method: str, path: str, **kwargs) -> dict:
        response, request_id = self.request(method, path, **kwargs)
        assert response.status_code < 400, response.text
        return self.open_response(response, request_id)
