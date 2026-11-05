//! What a file is, decided from its bytes rather than from its name.
//!
//! A declared content type is a claim by whoever uploaded the file. The
//! leading bytes are evidence. Where the two disagree the upload is
//! refused (SEC-12).
//!
//! See docs/security/hardening.md#file-uploads.

use crate::AppError;

/// 10 MB (VLT-1). The body limit rejects an oversized chunk before a
/// handler reads it; this is the whole-file ceiling.
pub const MAX_FILE_BYTES: i64 = 10 * 1024 * 1024;

/// 512 KiB, as the wire contract specifies. At the 10 MB ceiling a file is
/// at most 20 chunks (docs/api/encryption.md#file-bytes).
pub const CHUNK_BYTES: i64 = 512 * 1024;

/// The only types this product accepts: a receipt photograph or a
/// statement. Nothing that executes when opened.
pub const ACCEPTED_TYPES: [&str; 4] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/// How many chunks a file of this size takes.
pub fn chunk_count(size_bytes: i64) -> u32 {
    if size_bytes <= 0 {
        return 0;
    }
    // Rounded up by hand: `div_ceil` on a signed integer is still
    // unstable on the pinned toolchain.
    ((size_bytes + CHUNK_BYTES - 1) / CHUNK_BYTES) as u32
}

/// Check the declared type and size before a single byte is accepted.
pub fn validate_declaration(
    content_type: &str,
    size_bytes: i64,
    max_bytes: i64,
) -> Result<String, AppError> {
    let declared = content_type.trim().to_lowercase();

    if !ACCEPTED_TYPES.contains(&declared.as_str()) {
        return Err(AppError::UnsupportedFileType);
    }
    if size_bytes <= 0 {
        return Err(AppError::validation([("size_bytes", "The file is empty.")]));
    }
    if size_bytes > max_bytes {
        return Err(AppError::FileTooLarge);
    }

    Ok(declared)
}

/// What the leading bytes say the file is.
///
/// `None` for anything not on the accepted list, which is the answer for
/// an executable renamed to `.jpg` as much as for a format this product
/// simply does not take.
pub fn sniff(bytes: &[u8]) -> Option<&'static str> {
    // SVG and HTML are refused outright, before anything else looks at
    // them: both execute script when opened, and both can hide behind a
    // leading comment or a byte order mark.
    if looks_like_markup(bytes) {
        return None;
    }

    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("image/jpeg");
    }
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        return Some("image/png");
    }
    // RIFF....WEBP: the four size bytes sit between the two markers.
    if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if bytes.starts_with(b"%PDF-") {
        return Some("application/pdf");
    }

    None
}

/// Does this look like something a browser would run?
fn looks_like_markup(bytes: &[u8]) -> bool {
    // Only the start matters: a PDF or a JPEG can legitimately contain the
    // text `<svg` somewhere inside it.
    let head = &bytes[..bytes.len().min(512)];
    let text = String::from_utf8_lossy(head)
        .trim_start_matches('\u{feff}')
        .trim_start()
        .to_lowercase();

    text.starts_with("<svg")
        || text.starts_with("<!doctype html")
        || text.starts_with("<html")
        || (text.starts_with("<?xml") && text.contains("<svg"))
}

/// Check the sniffed type against the declared one (SEC-12).
pub fn verify_type(declared: &str, bytes: &[u8]) -> Result<&'static str, AppError> {
    match sniff(bytes) {
        Some(actual) if actual == declared => Ok(actual),
        // A mismatch and an unrecognised file are the same answer: the
        // bytes are not what the upload said they were.
        _ => Err(AppError::UnsupportedFileType),
    }
}

/// The storage key for a file. Generated, never derived from a filename
/// (SEC-13).
pub fn storage_key(workspace_id: &str, file_id: &str) -> String {
    format!("wsp/{workspace_id}/{file_id}")
}

/// At most this many tags on one file (VLT-9).
pub const MAX_TAGS: usize = 10;

/// At most this many characters in one tag.
pub const MAX_TAG_CHARS: usize = 32;

/// The square edge of a stored preview, in pixels (D91). Large enough for
/// the biggest tile at 2x, small enough to stay a single response.
pub const THUMBNAIL_PX: u32 = 320;

/// Trim, drop blanks, and dedupe case-insensitively, keeping the first
/// spelling. A list that is still too long, or a tag that is, is refused
/// rather than cut, so nothing the user typed disappears silently.
pub fn normalize_tags(tags: &[String]) -> Result<Vec<String>, AppError> {
    let mut kept: Vec<String> = Vec::new();

    for tag in tags {
        let trimmed = tag.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.chars().count() > MAX_TAG_CHARS {
            return Err(AppError::validation([(
                "tags",
                "A tag can be at most 32 characters.",
            )]));
        }
        if !kept
            .iter()
            .any(|seen| seen.to_lowercase() == trimmed.to_lowercase())
        {
            kept.push(trimmed.to_string());
        }
    }

    if kept.len() > MAX_TAGS {
        return Err(AppError::validation([(
            "tags",
            "A file can carry at most 10 tags.",
        )]));
    }

    Ok(kept)
}

/// Whether a preview can be made from this type at all. PDFs cannot: the
/// sheet shows the document itself instead (D91).
pub fn has_thumbnail_source(content_type: &str) -> bool {
    matches!(content_type, "image/jpeg" | "image/png" | "image/webp")
}

#[cfg(test)]
mod tests {
    use super::*;

    const JPEG: &[u8] = &[0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10];
    const PNG: &[u8] = &[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 0x00];

    #[test]
    fn should_recognise_every_type_this_product_accepts() {
        assert_eq!(sniff(JPEG), Some("image/jpeg"));
        assert_eq!(sniff(PNG), Some("image/png"));
        assert_eq!(sniff(b"RIFF\x00\x00\x00\x00WEBPVP8 "), Some("image/webp"));
        assert_eq!(sniff(b"%PDF-1.7\n"), Some("application/pdf"));
    }

    /// The control this table exists for: an executable with a picture's
    /// name is still an executable.
    #[test]
    fn should_refuse_a_renamed_executable() {
        assert_eq!(sniff(b"\x7fELF\x02\x01\x01\x00"), None);
        assert_eq!(sniff(b"MZ\x90\x00"), None, "a Windows executable");
        assert_eq!(sniff(b"#!/bin/sh\necho hi"), None);
        assert_eq!(sniff(b"<?php system($_GET['c']); ?>"), None);
    }

    #[test]
    fn should_refuse_svg_and_html_however_they_are_dressed() {
        for markup in [
            &b"<svg xmlns=\"http://www.w3.org/2000/svg\"><script/></svg>"[..],
            b"  \n<SVG onload=alert(1)>",
            b"\xef\xbb\xbf<svg>",
            b"<?xml version=\"1.0\"?><svg xmlns=\"x\"/>",
            b"<!DOCTYPE html><html><body>",
            b"<html>",
        ] {
            assert_eq!(
                sniff(markup),
                None,
                "accepted {:?}",
                String::from_utf8_lossy(markup)
            );
        }
    }

    #[test]
    fn should_allow_markup_text_inside_a_real_file() {
        // A PDF that happens to contain the characters `<svg` is a PDF.
        let mut pdf = b"%PDF-1.7\n".to_vec();
        pdf.extend_from_slice(b"<svg>not markup, just bytes</svg>");
        assert_eq!(sniff(&pdf), Some("application/pdf"));
    }

    #[test]
    fn should_refuse_bytes_that_do_not_match_what_was_declared() {
        assert_eq!(verify_type("image/jpeg", JPEG).unwrap(), "image/jpeg");
        assert!(matches!(
            verify_type("image/jpeg", PNG),
            Err(AppError::UnsupportedFileType)
        ));
        assert!(matches!(
            verify_type("application/pdf", b"not a pdf"),
            Err(AppError::UnsupportedFileType)
        ));
    }

    #[test]
    fn should_refuse_a_declaration_this_product_does_not_take() {
        for kind in [
            "image/svg+xml",
            "text/html",
            "application/zip",
            "",
            "IMAGE/GIF",
        ] {
            assert!(
                matches!(
                    validate_declaration(kind, 1024, MAX_FILE_BYTES),
                    Err(AppError::UnsupportedFileType)
                ),
                "accepted {kind:?}"
            );
        }
        assert_eq!(
            validate_declaration("IMAGE/JPEG", 1024, MAX_FILE_BYTES).unwrap(),
            "image/jpeg"
        );
    }

    #[test]
    fn should_refuse_a_file_that_is_empty_or_over_the_ceiling() {
        assert!(matches!(
            validate_declaration("image/jpeg", MAX_FILE_BYTES + 1, MAX_FILE_BYTES),
            Err(AppError::FileTooLarge)
        ));
        assert!(validate_declaration("image/jpeg", 0, MAX_FILE_BYTES).is_err());
        assert!(validate_declaration("image/jpeg", MAX_FILE_BYTES, MAX_FILE_BYTES).is_ok());
    }

    #[test]
    fn should_count_chunks_from_the_size() {
        assert_eq!(chunk_count(0), 0);
        assert_eq!(chunk_count(1), 1);
        assert_eq!(chunk_count(CHUNK_BYTES), 1);
        assert_eq!(chunk_count(CHUNK_BYTES + 1), 2);
        // The ceiling, which the wire contract says is at most 20 chunks.
        assert_eq!(chunk_count(MAX_FILE_BYTES), 20);
    }

    #[test]
    fn should_build_a_key_from_ids_and_nothing_else() {
        assert_eq!(storage_key("w1", "f1"), "wsp/w1/f1");
    }

    #[test]
    fn should_trim_and_dedupe_tags_keeping_the_first_spelling() {
        let tags = vec![
            " Receipt ".to_string(),
            "receipt".to_string(),
            "".to_string(),
            "Invoice".to_string(),
        ];
        assert_eq!(normalize_tags(&tags).unwrap(), vec!["Receipt", "Invoice"]);
    }

    #[test]
    fn should_refuse_too_many_or_too_long_tags() {
        let many: Vec<String> = (0..11).map(|n| format!("t{n}")).collect();
        assert!(normalize_tags(&many).is_err());
        assert!(normalize_tags(&["x".repeat(33)]).is_err());
        assert!(normalize_tags(&["x".repeat(32)]).is_ok());
    }

    #[test]
    fn should_only_make_previews_from_images() {
        assert!(has_thumbnail_source("image/png"));
        assert!(!has_thumbnail_source("application/pdf"));
    }
}
