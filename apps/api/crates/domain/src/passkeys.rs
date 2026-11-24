//! Where a passkey ceremony may come from besides the web app (D119).

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};

/// The origin Android's Credential Manager names for a native app, one per
/// signing certificate: `android:apk-key-hash:` and the base64url, without
/// padding, of the certificate's SHA-256.
///
/// `fingerprints` is the form keytool and Play Console print, colon-separated
/// hex, with a comma between certificates. Empty means none.
pub fn android_origins(fingerprints: &str) -> Result<Vec<String>, String> {
    fingerprints
        .split(',')
        .map(str::trim)
        .filter(|fingerprint| !fingerprint.is_empty())
        .map(|fingerprint| {
            let bytes = fingerprint
                .split(':')
                .map(|pair| {
                    (pair.len() == 2 && pair.bytes().all(|b| b.is_ascii_hexdigit()))
                        .then(|| u8::from_str_radix(pair, 16).ok())
                        .flatten()
                })
                .collect::<Option<Vec<u8>>>()
                .filter(|bytes| bytes.len() == 32)
                .ok_or_else(|| {
                    format!("{fingerprint:?} is not a colon-separated SHA-256 fingerprint")
                })?;
            Ok(format!(
                "android:apk-key-hash:{}",
                URL_SAFE_NO_PAD.encode(bytes)
            ))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Google's sample fingerprint from the Digital Asset Links docs.
    const SAMPLE: &str =
        "14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42:E6:1D:BE:A8:8A:04:96:B2:3F:CF:44:E5";

    /// Derived outside Rust: `echo $SAMPLE | tr -d : | xxd -r -p | openssl
    /// base64 -A | tr '+/' '-_' | tr -d =`, and the same with Python's
    /// `base64.urlsafe_b64encode`.
    const SAMPLE_ORIGIN: &str = "android:apk-key-hash:FG3pg8VzBlDY7rmVLzT8ZBagg0LmHb6oigSWsj_PROU";

    #[test]
    fn should_derive_the_origin_android_sends() {
        assert_eq!(android_origins(SAMPLE).unwrap(), vec![SAMPLE_ORIGIN]);
        assert_eq!(
            android_origins(&SAMPLE.to_lowercase()).unwrap(),
            vec![SAMPLE_ORIGIN]
        );
    }

    #[test]
    fn should_take_several_and_ignore_blanks() {
        let both = format!(" {SAMPLE} ,, {SAMPLE} ");
        assert_eq!(android_origins(&both).unwrap().len(), 2);
        assert!(android_origins("").unwrap().is_empty());
        assert!(android_origins(" , ").unwrap().is_empty());
    }

    #[test]
    fn should_refuse_what_is_not_a_sha256_fingerprint() {
        // SHA-1, which Play Console prints next to it.
        assert!(
            android_origins("14:6D:E9:83:C5:73:06:50:D8:EE:B9:95:2F:34:FC:64:16:A0:83:42").is_err()
        );
        assert!(android_origins(&SAMPLE.replace(':', "")).is_err());
        assert!(android_origins(&SAMPLE.replacen("14", "+4", 1)).is_err());
        assert!(android_origins(&SAMPLE.replacen("14", "ZZ", 1)).is_err());
    }
}
