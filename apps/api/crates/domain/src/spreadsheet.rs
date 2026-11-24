//! Reading an `.xlsx` into the shape the import wizard already has (D111).
//!
//! The wizard parses a CSV in the browser into column names and rows of cell
//! text. A spreadsheet is read here instead, because the only npm build of a
//! reader carries an advisory and would run in the session's context, and it
//! comes out in exactly that shape: strings, nothing parsed. Every figure and
//! date is still read by [`crate::csv_import`] at commit, as for a CSV (D28).
//!
//! The file is hostile input. Its size, the size it unpacks to, the strings
//! table it declares, its rows and its columns are all bounded before or while
//! it is read, and nothing in it is logged (OPS-3).

use std::io::{Cursor, Read};

use calamine::{DataRef, Reader, Xlsx};
use chrono::NaiveTime;
use serde::Serialize;

use crate::{csv_import::RawRow, AppError};

/// The largest file accepted. A vault chunk's size, for the same reason: it
/// is what fits the 1 MiB body limit once base64 and the OWE1 seal are on it
/// (docs/api/encryption.md#file-bytes). Five thousand rows of a bank export
/// is a fraction of this, because an `.xlsx` is already compressed.
pub const MAX_SPREADSHEET_BYTES: usize = 512 * 1024;

/// What the package may unpack to, in total. Measured from the zip directory
/// before anything is inflated; the zip reader then refuses an entry that
/// inflates past what it declared, so a lying header is caught as well.
pub const MAX_UNPACKED_BYTES: u128 = 32 * 1024 * 1024;

/// Columns a header may have. A bank export has ten or so.
pub const MAX_COLUMNS: usize = 100;

/// Entries a strings table may declare. calamine reserves this many up front,
/// and a reservation that fails aborts the process rather than erroring.
const MAX_SHARED_STRINGS: u64 = 1_000_000;

/// The first worksheet, as the wizard's step one produces it from a CSV.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Sheet {
    pub columns: Vec<String>,
    pub rows: Vec<RawRow>,
    /// Rows with a value beyond the last named column, which a CSV parser
    /// would call malformed and drop.
    pub dropped: usize,
}

/// Read the first worksheet of an `.xlsx`.
///
/// The first row with any text is the header. Blank rows are skipped, as a
/// blank line is in a CSV. More than `row_limit` data rows is refused rather
/// than truncated, because a silently shortened statement imports wrong.
pub fn read_xlsx(bytes: &[u8], row_limit: usize) -> Result<Sheet, AppError> {
    if bytes.len() > MAX_SPREADSHEET_BYTES {
        return Err(AppError::SpreadsheetTooLarge);
    }
    check_package(bytes)?;

    let mut workbook: Xlsx<_> =
        Xlsx::new(Cursor::new(bytes)).map_err(|_| AppError::SpreadsheetUnreadable)?;
    let first = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or(AppError::SpreadsheetUnreadable)?;
    let mut cells = workbook
        .worksheet_cells_reader(&first)
        .map_err(|_| AppError::SpreadsheetUnreadable)?;

    let mut sheet = Sheet {
        columns: Vec::new(),
        rows: Vec::new(),
        dropped: 0,
    };
    // The row being gathered: its index, its cells up to the column cap, and
    // whether it had a value past the header.
    let mut current: Option<(u32, Vec<String>, bool)> = None;

    loop {
        let cell = cells
            .next_cell()
            .map_err(|_| AppError::SpreadsheetUnreadable)?;
        let (row, column) = match &cell {
            Some(cell) => cell.get_position(),
            None => (u32::MAX, 0),
        };

        if current.as_ref().is_some_and(|(index, ..)| *index != row) {
            let (_, values, overflow) = current.take().unwrap_or_default();
            finish_row(&mut sheet, values, overflow, row_limit)?;
        }
        let Some(cell) = cell else { break };

        let text = cell_text(cell.get_value());
        let (_, values, overflow) = current.get_or_insert_with(|| (row, Vec::new(), false));
        let column = column as usize;
        if text.is_empty() {
            continue;
        }
        if column >= MAX_COLUMNS {
            if sheet.columns.is_empty() {
                return Err(AppError::SpreadsheetTooLarge);
            }
            *overflow = true;
            continue;
        }
        if values.len() <= column {
            values.resize(column + 1, String::new());
        }
        values[column] = text;
    }

    Ok(sheet)
}

fn finish_row(
    sheet: &mut Sheet,
    values: Vec<String>,
    overflow: bool,
    row_limit: usize,
) -> Result<(), AppError> {
    if values.iter().all(String::is_empty) && !overflow {
        return Ok(());
    }

    if sheet.columns.is_empty() {
        sheet.columns = values
            .into_iter()
            .enumerate()
            // An unnamed column still has to be addressable by the mapping,
            // and is named as the CSV parser names it.
            .map(|(index, name)| {
                if name.is_empty() {
                    format!("Column {}", index + 1)
                } else {
                    name
                }
            })
            .collect();
        return Ok(());
    }

    if overflow || values.len() > sheet.columns.len() {
        sheet.dropped += 1;
        return Ok(());
    }
    if sheet.rows.len() >= row_limit {
        return Err(AppError::SpreadsheetTooLarge);
    }

    let mut row: RawRow = sheet
        .columns
        .iter()
        .map(|name| (name.clone(), String::new()))
        .collect();
    for (name, value) in sheet.columns.iter().zip(values) {
        row.insert(name.clone(), value);
    }
    sheet.rows.push(row);
    Ok(())
}

/// One cell as text, never through a float the user did not write.
///
/// calamine reads a number cell as an `f64`. Rust prints an `f64` as the
/// shortest text that reads back as the same value, so a figure the file
/// wrote with up to 15 significant digits (every amount a bank exports)
/// comes back as exactly the digits in the file: `87500.5`, not
/// `87500.50000000001`. It is then a string, and `csv_import` parses it into
/// a `Decimal` like any CSV cell.
///
/// A date cell comes back as `YYYY-MM-DD`, or `YYYY-MM-DDTHH:MM:SS` when it
/// carries a time, both of which `csv_import::parse_date` reads.
fn cell_text(value: &DataRef<'_>) -> String {
    let text = match value {
        DataRef::Empty | DataRef::Error(_) => String::new(),
        DataRef::String(text) | DataRef::DateTimeIso(text) | DataRef::DurationIso(text) => {
            text.clone()
        }
        DataRef::SharedString(text) => (*text).to_string(),
        DataRef::Int(number) => number.to_string(),
        DataRef::Float(number) => number.to_string(),
        DataRef::Bool(flag) => if *flag { "TRUE" } else { "FALSE" }.to_string(),
        DataRef::DateTime(moment) => match moment.as_datetime() {
            Some(at) if moment.is_datetime() && at.time() == NaiveTime::MIN => {
                at.date().format("%Y-%m-%d").to_string()
            }
            Some(at) if moment.is_datetime() => at.format("%Y-%m-%dT%H:%M:%S").to_string(),
            _ => moment.as_f64().to_string(),
        },
    };
    text.trim().to_string()
}

/// Refuse what is not a zip, what unpacks too far, and a strings table that
/// declares more entries than a capped import could hold.
fn check_package(bytes: &[u8]) -> Result<(), AppError> {
    if !bytes.starts_with(b"PK\x03\x04") {
        return Err(AppError::SpreadsheetUnreadable);
    }
    let mut zip =
        zip::ZipArchive::new(Cursor::new(bytes)).map_err(|_| AppError::SpreadsheetUnreadable)?;

    // The central directory's sizes, which the reader then holds each entry
    // to, data descriptor or not. Not `decompressed_size()`, which gives up
    // on any entry with a data descriptor, and many writers use one.
    let mut unpacked: u128 = 0;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|_| AppError::SpreadsheetUnreadable)?;
        unpacked += u128::from(entry.size());
        if unpacked > MAX_UNPACKED_BYTES {
            return Err(AppError::SpreadsheetTooLarge);
        }
        let name = entry
            .name()
            .map_err(|_| AppError::SpreadsheetUnreadable)?
            .to_ascii_lowercase();
        if !name.ends_with("sharedstrings.xml") {
            continue;
        }
        let mut xml = Vec::new();
        entry
            .read_to_end(&mut xml)
            .map_err(|_| AppError::SpreadsheetUnreadable)?;
        if declares_too_many_strings(&xml) {
            return Err(AppError::SpreadsheetTooLarge);
        }
    }
    Ok(())
}

/// Every `uniqueCount="…"` in the table, read as generously as possible: any
/// digits in the value count, so no spelling of a large number slips past.
fn declares_too_many_strings(xml: &[u8]) -> bool {
    const NAME: &[u8] = b"uniqueCount";
    (0..xml.len().saturating_sub(NAME.len()))
        .filter(|&at| xml[at..].starts_with(NAME))
        .any(|at| {
            let rest = &xml[at + NAME.len()..];
            let mut bytes = rest.iter().skip_while(|b| b.is_ascii_whitespace());
            if bytes.next() != Some(&b'=') {
                return false;
            }
            let mut bytes = bytes.skip_while(|b| b.is_ascii_whitespace());
            let Some(&quote) = bytes.next().filter(|b| **b == b'"' || **b == b'\'') else {
                return false;
            };
            let digits: Vec<u8> = bytes
                .take_while(|b| **b != quote)
                .filter(|b| b.is_ascii_digit())
                .copied()
                .collect();
            digits.len() > 7
                || std::str::from_utf8(&digits)
                    .ok()
                    .and_then(|text| text.parse::<u64>().ok())
                    .is_some_and(|count| count > MAX_SHARED_STRINGS)
        })
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;
    use rust_decimal::Decimal;
    use rust_xlsxwriter::{ExcelDateTime, Format, Workbook};

    use super::*;
    use crate::csv_import::{parse_amount, parse_date};

    const LIMIT: usize = 5_000;

    /// A bank export's shape: a header, then text, an integer, a decimal, a
    /// date and an empty cell.
    fn statement() -> Vec<u8> {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        let date = Format::new().set_num_format("dd/mm/yyyy");

        for (column, name) in ["Tanggal", "Keterangan", "Debet", "Kredit", "Catatan"]
            .iter()
            .enumerate()
        {
            sheet.write_string(0, column as u16, *name).unwrap();
        }

        let day = ExcelDateTime::from_ymd(2026, 11, 2).unwrap();
        sheet.write_datetime_with_format(1, 0, &day, &date).unwrap();
        sheet.write_string(1, 1, "WARUNG TEKKO").unwrap();
        sheet.write_number(1, 2, 87500.50).unwrap();
        // Column 3 (Kredit) is left empty.
        sheet.write_string(1, 4, " lunch ").unwrap();

        sheet.write_datetime_with_format(2, 0, &day, &date).unwrap();
        sheet.write_string(2, 1, "GAJI").unwrap();
        sheet.write_number(2, 3, 12_000_000.0).unwrap();

        workbook.save_to_buffer().unwrap()
    }

    fn with_rows(count: u32) -> Vec<u8> {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "Amount").unwrap();
        for row in 1..=count {
            sheet.write_number(row, 0, f64::from(row)).unwrap();
        }
        workbook.save_to_buffer().unwrap()
    }

    #[test]
    fn should_read_a_sheet_into_the_shape_a_csv_has() {
        let sheet = read_xlsx(&statement(), LIMIT).unwrap();

        assert_eq!(
            sheet.columns,
            ["Tanggal", "Keterangan", "Debet", "Kredit", "Catatan"]
        );
        assert_eq!(sheet.rows.len(), 2);
        assert_eq!(sheet.dropped, 0);

        let first = &sheet.rows[0];
        assert_eq!(first["Keterangan"], "WARUNG TEKKO");
        assert_eq!(first["Catatan"], "lunch", "trimmed, as a CSV cell is");
        assert_eq!(first["Kredit"], "", "an empty cell is an empty string");
        assert_eq!(
            sheet.rows[1]["Kredit"], "12000000",
            "an integer has no `.0`"
        );
        assert_eq!(sheet.rows[1]["Catatan"], "", "a short row is padded");
    }

    /// The form a date cell comes out in, and that the importer reads it.
    #[test]
    fn should_write_a_date_cell_as_an_iso_date() {
        let sheet = read_xlsx(&statement(), LIMIT).unwrap();

        assert_eq!(sheet.rows[0]["Tanggal"], "2026-11-02");
        assert_eq!(
            parse_date(&sheet.rows[0]["Tanggal"]),
            NaiveDate::from_ymd_opt(2026, 11, 2)
        );
    }

    #[test]
    fn should_keep_the_exact_digits_of_a_number_cell() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "Amount").unwrap();
        let figures = [87500.50, 0.1, 1_234_567_890_123.45, 0.07, 999_999.99];
        for (row, figure) in figures.iter().enumerate() {
            sheet.write_number(row as u32 + 1, 0, *figure).unwrap();
        }
        let read = read_xlsx(&workbook.save_to_buffer().unwrap(), LIMIT).unwrap();

        let texts: Vec<&str> = read.rows.iter().map(|row| row["Amount"].as_str()).collect();
        assert_eq!(
            texts,
            ["87500.5", "0.1", "1234567890123.45", "0.07", "999999.99"]
        );
        assert_eq!(
            parse_amount(texts[0]),
            Some(Decimal::new(8_750_050, 2)),
            "and it reads as the decimal it is"
        );
    }

    #[test]
    fn should_take_exactly_the_row_cap_and_refuse_one_more() {
        assert_eq!(read_xlsx(&with_rows(20), 20).unwrap().rows.len(), 20);
        assert!(matches!(
            read_xlsx(&with_rows(21), 20),
            Err(AppError::SpreadsheetTooLarge)
        ));
    }

    #[test]
    fn should_refuse_a_header_wider_than_the_column_cap() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        for column in 0..=MAX_COLUMNS as u16 {
            sheet.write_string(0, column, "x").unwrap();
        }
        assert!(matches!(
            read_xlsx(&workbook.save_to_buffer().unwrap(), LIMIT),
            Err(AppError::SpreadsheetTooLarge)
        ));
    }

    #[test]
    fn should_drop_a_row_with_a_value_past_the_header() {
        let mut workbook = Workbook::new();
        let sheet = workbook.add_worksheet();
        sheet.write_string(0, 0, "Amount").unwrap();
        sheet.write_number(1, 0, 1.0).unwrap();
        sheet.write_number(2, 0, 2.0).unwrap();
        sheet.write_string(2, 3, "stray").unwrap();

        let read = read_xlsx(&workbook.save_to_buffer().unwrap(), LIMIT).unwrap();
        assert_eq!(read.rows.len(), 1);
        assert_eq!(read.dropped, 1);
    }

    #[test]
    fn should_refuse_what_is_not_an_xlsx() {
        for bytes in [
            &b"Date,Amount\n02/11/2026,50000\n"[..],
            b"PK\x03\x04garbage",
            b"",
        ] {
            assert!(matches!(
                read_xlsx(bytes, LIMIT),
                Err(AppError::SpreadsheetUnreadable)
            ));
        }
    }

    #[test]
    fn should_refuse_a_file_over_the_size_cap_before_reading_it() {
        let bytes = vec![0u8; MAX_SPREADSHEET_BYTES + 1];
        assert!(matches!(
            read_xlsx(&bytes, LIMIT),
            Err(AppError::SpreadsheetTooLarge)
        ));
    }

    /// A package that inflates far past its size: a zip bomb, small.
    #[test]
    fn should_refuse_a_package_that_unpacks_too_far() {
        use std::io::Write;
        use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file(
                "xl/worksheets/sheet1.xml",
                SimpleFileOptions::default()
                    .compression_method(CompressionMethod::Deflated)
                    .large_file(true),
            )
            .unwrap();
        let block = vec![b' '; 1024 * 1024];
        for _ in 0..=MAX_UNPACKED_BYTES / block.len() as u128 {
            writer.write_all(&block).unwrap();
        }
        let bytes = writer.finish().unwrap().into_inner();

        assert!(bytes.len() < MAX_SPREADSHEET_BYTES, "small on the wire");
        assert!(matches!(
            read_xlsx(&bytes, LIMIT),
            Err(AppError::SpreadsheetTooLarge)
        ));
    }

    #[test]
    fn should_spot_a_strings_table_that_declares_too_much() {
        assert!(declares_too_many_strings(
            br#"<sst xmlns="x" count="1" uniqueCount="99999999999">"#
        ));
        assert!(declares_too_many_strings(
            br#"<sst uniqueCount = '+2000000'>"#
        ));
        assert!(!declares_too_many_strings(
            br#"<sst count="3" uniqueCount="3">"#
        ));
    }
}
