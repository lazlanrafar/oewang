//! Images the API makes itself: vault previews (D91) and profile photos
//! (D94). One decoder, one set of limits, one encoder.

/// Decode, turn upright, crop to a square, encode as JPEG.
///
/// The limits bound what a hostile file can make the decoder allocate: a
/// 10 MB upload can still claim to be a gigapixel image.
pub fn square_jpeg(bytes: &[u8], px: u32) -> Option<Vec<u8>> {
    use image::{DynamicImage, ImageDecoder, ImageReader, Limits};

    let mut limits = Limits::default();
    limits.max_image_width = Some(8000);
    limits.max_image_height = Some(8000);
    limits.max_alloc = Some(128 * 1024 * 1024);

    let mut reader = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .ok()?;
    reader.limits(limits);

    let mut decoder = reader.into_decoder().ok()?;
    let orientation = decoder.orientation().ok();
    let mut decoded = DynamicImage::from_decoder(decoder).ok()?;
    if let Some(orientation) = orientation {
        decoded.apply_orientation(orientation);
    }

    let square = decoded.resize_to_fill(px, px, image::imageops::FilterType::Triangle);

    // JPEG has no alpha. Dropping it would turn every transparent pixel
    // black, so a logo on a clear background is laid on white first.
    let rgba = square.to_rgba8();
    let flat = image::RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
        let [r, g, b, a] = rgba.get_pixel(x, y).0;
        let over = |channel: u8| {
            ((u16::from(channel) * u16::from(a) + 255 * (255 - u16::from(a))) / 255) as u8
        };
        image::Rgb([over(r), over(g), over(b)])
    });

    let mut out = Vec::new();
    let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut out, 80);
    flat.write_with_encoder(encoder).ok()?;
    Some(out)
}
