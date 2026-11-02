//! The S3-compatible backend.
//!
//! Signs its own requests with AWS Signature Version 4 rather than taking
//! the AWS SDK. Three verbs against one object each (PUT, GET, DELETE) is
//! a bounded amount of signing, and the SDK brings a dependency tree far
//! larger than the thing it would do here. The primitives are the ones the
//! project already uses: SHA-256 and HMAC.
//!
//! Path-style addressing throughout, because MinIO in development is
//! reached by path and a virtual-host bucket would need DNS for it.

use chrono::Utc;
use hmac::{Hmac, Mac};
use sha2::{Digest, Sha256};

use super::{Storage, StorageError, StorageResult};

type HmacSha256 = Hmac<Sha256>;

/// The empty-payload hash, which signing needs for GET and DELETE.
const EMPTY_SHA256: &str = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

#[derive(Clone)]
pub struct S3Storage {
    http: reqwest::Client,
    endpoint: String,
    bucket: String,
    region: String,
    access_key_id: String,
    secret_access_key: String,
}

impl std::fmt::Debug for S3Storage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The secret never reaches a log line (OPS-3).
        f.debug_struct("S3Storage")
            .field("endpoint", &self.endpoint)
            .field("bucket", &self.bucket)
            .field("region", &self.region)
            .finish()
    }
}

pub struct S3Config {
    pub endpoint: String,
    pub bucket: String,
    pub region: String,
    pub access_key_id: String,
    pub secret_access_key: String,
}

impl S3Storage {
    pub fn new(config: S3Config) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
            endpoint: config.endpoint.trim_end_matches('/').to_string(),
            bucket: config.bucket,
            region: config.region,
            access_key_id: config.access_key_id,
            secret_access_key: config.secret_access_key,
        }
    }

    fn url(&self, key: &str) -> String {
        format!("{}/{}/{}", self.endpoint, self.bucket, key)
    }

    /// The path a signature covers, each segment percent-encoded.
    fn canonical_path(&self, key: &str) -> String {
        let segments: Vec<String> = format!("{}/{}", self.bucket, key)
            .split('/')
            .map(encode_segment)
            .collect();
        format!("/{}", segments.join("/"))
    }

    fn host(&self) -> String {
        self.endpoint
            .split("://")
            .nth(1)
            .unwrap_or(&self.endpoint)
            .to_string()
    }

    /// Build the `Authorization` header for one request (SigV4).
    ///
    /// Three headers are signed and no more: host, the payload hash and
    /// the date. Signing fewer is a weaker signature; signing more means
    /// keeping two lists in step for no gain.
    fn authorization(&self, method: &str, key: &str, payload_hash: &str, stamp: &str) -> String {
        let date = &stamp[..8];
        let host = self.host();

        let canonical_request = format!(
            "{method}\n{}\n\nhost:{host}\nx-amz-content-sha256:{payload_hash}\nx-amz-date:{stamp}\n\n{}\n{payload_hash}",
            self.canonical_path(key),
            SIGNED_HEADERS
        );

        let scope = format!("{date}/{}/s3/aws4_request", self.region);
        let string_to_sign = format!(
            "AWS4-HMAC-SHA256\n{stamp}\n{scope}\n{}",
            hex(&Sha256::digest(canonical_request.as_bytes()))
        );

        let signature = hex(&hmac(
            &signing_key(&self.secret_access_key, date, &self.region, "s3"),
            string_to_sign.as_bytes(),
        ));

        format!(
            "AWS4-HMAC-SHA256 Credential={}/{scope}, SignedHeaders={SIGNED_HEADERS}, Signature={signature}",
            self.access_key_id
        )
    }

    async fn send(
        &self,
        method: reqwest::Method,
        key: &str,
        body: Option<Vec<u8>>,
    ) -> StorageResult<reqwest::Response> {
        let payload_hash = match &body {
            Some(bytes) => hex(&Sha256::digest(bytes)),
            None => EMPTY_SHA256.to_string(),
        };
        let stamp = Utc::now().format("%Y%m%dT%H%M%SZ").to_string();

        let mut request = self
            .http
            .request(method.clone(), self.url(key))
            .header("host", self.host())
            .header("x-amz-content-sha256", &payload_hash)
            .header("x-amz-date", &stamp)
            .header(
                "authorization",
                self.authorization(method.as_str(), key, &payload_hash, &stamp),
            );

        if let Some(bytes) = body {
            request = request.body(bytes);
        }

        request
            .send()
            .await
            .map_err(|error| StorageError::Unavailable(error.to_string()))
    }
}

const SIGNED_HEADERS: &str = "host;x-amz-content-sha256;x-amz-date";

impl Storage for S3Storage {
    async fn put(&self, key: &str, bytes: &[u8]) -> StorageResult<()> {
        let response = self.send(reqwest::Method::PUT, key, Some(bytes.to_vec())).await?;

        if response.status().is_success() {
            Ok(())
        } else {
            // The body may carry the bucket name and the key; the status is
            // what a caller can act on.
            Err(StorageError::Unavailable(format!("put: {}", response.status())))
        }
    }

    async fn get(&self, key: &str) -> StorageResult<Vec<u8>> {
        let response = self.send(reqwest::Method::GET, key, None).await?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(StorageError::NotFound);
        }
        if !response.status().is_success() {
            return Err(StorageError::Unavailable(format!("get: {}", response.status())));
        }

        response
            .bytes()
            .await
            .map(|bytes| bytes.to_vec())
            .map_err(|error| StorageError::Unavailable(error.to_string()))
    }

    async fn delete(&self, key: &str) -> StorageResult<()> {
        let response = self.send(reqwest::Method::DELETE, key, None).await?;

        // S3 answers 204 for a delete whether the object was there or not.
        if response.status().is_success() || response.status() == reqwest::StatusCode::NOT_FOUND {
            Ok(())
        } else {
            Err(StorageError::Unavailable(format!("delete: {}", response.status())))
        }
    }
}

/// The four-step signing key.
///
/// The service is a parameter rather than a constant so the chain can be
/// checked against the example AWS documents, which uses `iam`.
fn signing_key(secret: &str, date: &str, region: &str, service: &str) -> Vec<u8> {
    let date_key = hmac(format!("AWS4{secret}").as_bytes(), date.as_bytes());
    let region_key = hmac(&date_key, region.as_bytes());
    let service_key = hmac(&region_key, service.as_bytes());
    hmac(&service_key, b"aws4_request")
}

fn hmac(key: &[u8], message: &[u8]) -> Vec<u8> {
    let mut mac = HmacSha256::new_from_slice(key).expect("hmac takes a key of any length");
    mac.update(message);
    mac.finalize().into_bytes().to_vec()
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// Percent-encode one path segment, by the rules SigV4 uses.
///
/// Unreserved characters stay; everything else becomes `%XX` in upper
/// case. A key is generated from ids, so this only ever matters if that
/// ever changes.
fn encode_segment(segment: &str) -> String {
    segment
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' | b'~' => {
                (byte as char).to_string()
            }
            other => format!("%{other:02X}"),
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn storage() -> S3Storage {
        S3Storage::new(S3Config {
            endpoint: "http://minio:9000".into(),
            bucket: "oewang-vault".into(),
            region: "us-east-1".into(),
            access_key_id: "AKIAIOSFODNN7EXAMPLE".into(),
            secret_access_key: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY".into(),
        })
    }

    /// The signing-key chain, pinned to the example AWS publishes.
    ///
    /// The chain is the part that is easy to get subtly wrong and
    /// impossible to debug from a 403, so it is checked against a known
    /// answer rather than against whatever this code happens to produce.
    /// AWS documents the example for the `iam` service, which is why the
    /// chain takes the service name rather than hard-coding `s3`.
    #[test]
    fn should_derive_the_signing_key_aws_documents() {
        let signing_key = signing_key(
            "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
            "20150830",
            "us-east-1",
            "iam",
        );

        assert_eq!(
            hex(&signing_key),
            "c4afb1cc5771d871763a393e44b703571b55cc28424d1a5e86da6ed3c154a4b9"
        );
    }

    #[test]
    fn should_address_a_bucket_by_path_not_by_host() {
        // MinIO in development is reached by path; a virtual-host bucket
        // would need DNS for it.
        let storage = storage();
        assert_eq!(storage.url("wsp/w1/f1/00000"), "http://minio:9000/oewang-vault/wsp/w1/f1/00000");
        assert_eq!(storage.canonical_path("wsp/w1/f1/00000"), "/oewang-vault/wsp/w1/f1/00000");
        assert_eq!(storage.host(), "minio:9000");
    }

    #[test]
    fn should_encode_a_segment_the_way_the_signature_expects() {
        assert_eq!(encode_segment("plain-name_1.txt"), "plain-name_1.txt");
        assert_eq!(encode_segment("a b"), "a%20b");
        assert_eq!(encode_segment("a+b"), "a%2Bb");
    }

    #[test]
    fn should_sign_the_same_request_the_same_way_twice() {
        let storage = storage();
        let one = storage.authorization("PUT", "wsp/w1/f1/00000", EMPTY_SHA256, "20260102T030405Z");
        let two = storage.authorization("PUT", "wsp/w1/f1/00000", EMPTY_SHA256, "20260102T030405Z");

        assert_eq!(one, two);
        assert!(one.contains("Credential=AKIAIOSFODNN7EXAMPLE/20260102/us-east-1/s3/aws4_request"));
        assert!(one.contains("SignedHeaders=host;x-amz-content-sha256;x-amz-date"));
    }

    #[test]
    fn should_sign_differently_for_a_different_key_or_method() {
        let storage = storage();
        let put = storage.authorization("PUT", "wsp/w1/f1/00000", EMPTY_SHA256, "20260102T030405Z");
        let get = storage.authorization("GET", "wsp/w1/f1/00000", EMPTY_SHA256, "20260102T030405Z");
        let other = storage.authorization("PUT", "wsp/w1/f1/00001", EMPTY_SHA256, "20260102T030405Z");

        assert_ne!(put, get);
        assert_ne!(put, other);
    }

    #[test]
    fn should_not_print_the_secret() {
        assert!(!format!("{:?}", storage()).contains("wJalr"));
    }
}

/// A round trip against a real S3-compatible service.
///
/// Ignored by default, because it needs one running. The unit tests above
/// pin the signing chain to the example AWS documents; this is what proves
/// the whole signature, which a 403 would otherwise hide.
///
/// Run against the development MinIO with:
/// `cargo test -p oewang-clients -- --ignored --nocapture`
#[cfg(test)]
mod live {
    use super::*;

    #[tokio::test]
    #[ignore = "needs a running S3-compatible service"]
    async fn should_round_trip_against_minio() {
        let storage = S3Storage::new(S3Config {
            endpoint: std::env::var("S3_ENDPOINT").unwrap_or("http://minio:9000".into()),
            bucket: std::env::var("S3_BUCKET").unwrap_or("oewang-vault".into()),
            region: std::env::var("S3_REGION").unwrap_or("us-east-1".into()),
            access_key_id: std::env::var("S3_ACCESS_KEY_ID").unwrap_or("oewang".into()),
            secret_access_key: std::env::var("S3_SECRET_ACCESS_KEY")
                .unwrap_or("oewang-dev-secret".into()),
        });

        let key = "wsp/signature-check/round-trip/00000";

        storage.put(key, b"the bytes").await.expect("put");
        assert_eq!(storage.get(key).await.expect("get"), b"the bytes");

        storage.delete(key).await.expect("delete");
        assert!(matches!(storage.get(key).await, Err(StorageError::NotFound)));
    }
}
