//! How a name the assistant or the receipt reader wrote is spelled (D129).
//!
//! Title Case, with the exceptions a receipt or a chat message needs: a word
//! that already mixes case is kept as written ("DriveThru", "iPhone"), a
//! short all-caps acronym is kept ("BCA", "PT"), a word that starts with a
//! digit is a quantity and is kept ("1L", "500ml"), and the small connectors
//! stay lower after the first word. Text outside the Latin script has no
//! Title Case to apply and is left alone.
//!
//! A name with no lowercase at all is shouting, as a receipt usually is, and
//! there "ES TEH" is two words rather than two acronyms, so only the known
//! acronyms below survive it.

/// Lowercase after the first word.
const CONNECTORS: &[&str] = &["dan", "di", "ke", "and", "of", "the", "&"];

/// The acronyms kept even in a name written all in capitals.
const KNOWN_ACRONYMS: &[&str] = &[
    "PT", "CV", "UD", "TB", "BCA", "BNI", "BRI", "BSI", "BTN", "BPD", "ATM", "KFC", "QR", "ID",
];

/// Tidy `raw`: collapse runs of whitespace, trim, and Title Case it as
/// described above. Idempotent.
pub fn tidy_name(raw: &str) -> String {
    let words: Vec<&str> = raw.split_whitespace().collect();
    let shouting = is_shouting(&words);
    let mut seen_letter = false;

    words
        .iter()
        .map(|word| {
            let first = !seen_letter;
            seen_letter |= word.chars().any(char::is_alphabetic);
            tidy_word(word, first, shouting)
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn tidy_word(word: &str, first: bool, shouting: bool) -> String {
    let letters: Vec<char> = word.chars().filter(|c| c.is_alphabetic()).collect();
    let starts_with_digit = word
        .chars()
        .find(|c| c.is_alphanumeric())
        .is_some_and(|c| c.is_numeric());
    if letters.is_empty() || starts_with_digit || letters.iter().any(|c| !is_latin(*c)) {
        return word.to_string();
    }

    let lower = word.to_lowercase();
    if CONNECTORS.contains(&lower.as_str()) {
        return if first { title(word) } else { lower };
    }

    let has_upper = letters.iter().any(|c| c.is_uppercase());
    let has_lower = letters.iter().any(|c| c.is_lowercase());
    if has_upper && has_lower {
        return word.to_string();
    }

    let acronym = has_upper
        && (2..=3).contains(&letters.len())
        && (!shouting || KNOWN_ACRONYMS.contains(&word.trim_matches(|c: char| !c.is_alphabetic())));
    if acronym {
        return word.to_string();
    }

    title(word)
}

/// Upper the first letter of each run of letters, lower the rest. An
/// apostrophe does not start a run, so "DON'T" becomes "Don't".
fn title(word: &str) -> String {
    let mut out = String::with_capacity(word.len());
    let mut previous: Option<char> = None;
    for c in word.chars() {
        let continues = previous.is_some_and(|p| p.is_alphabetic() || p == '\'' || p == '’');
        if c.is_alphabetic() && !continues {
            out.extend(c.to_uppercase());
        } else if c.is_alphabetic() {
            out.extend(c.to_lowercase());
        } else {
            out.push(c);
        }
        previous = Some(c);
    }
    out
}

/// No run of two or more Latin letters holds a lowercase one. Counted on
/// runs rather than letters so that the output of a tidy is never read as
/// shouting when its input was not, which keeps the function idempotent.
fn is_shouting(words: &[&str]) -> bool {
    !words.iter().any(|word| {
        let mut run = 0usize;
        let mut run_has_lower = false;
        for c in word.chars().chain(std::iter::once(' ')) {
            if c.is_alphabetic() && is_latin(c) {
                run += 1;
                run_has_lower |= c.is_lowercase();
            } else {
                if run >= 2 && run_has_lower {
                    return true;
                }
                run = 0;
                run_has_lower = false;
            }
        }
        false
    })
}

fn is_latin(c: char) -> bool {
    c.is_ascii_alphabetic()
        || (c.is_alphabetic() && ('\u{00C0}'..='\u{024F}').contains(&c))
        || ('\u{1E00}'..='\u{1EFF}').contains(&c)
}

#[cfg(test)]
mod tests {
    use super::tidy_name;

    const EXAMPLES: &[(&str, &str)] = &[
        ("es teh poci", "Es Teh Poci"),
        ("MIXUE", "Mixue"),
        ("PABORITO COFFEE", "Paborito Coffee"),
        ("Jus alpukat dede", "Jus Alpukat Dede"),
        ("ACK Pering DriveThru", "ACK Pering DriveThru"),
        ("iPhone case", "iPhone Case"),
        ("McDonald's", "McDonald's"),
        ("zodiac coffee & co", "Zodiac Coffee & Co"),
        ("Zodiac Coffee & Co", "Zodiac Coffee & Co"),
        ("MINERAL WATER (Bottle)", "Mineral Water (Bottle)"),
        ("MINERAL WATER (BOTTLE)", "Mineral Water (Bottle)"),
        ("aqua 1L", "Aqua 1L"),
        ("susu 500ml", "Susu 500ml"),
        ("  es   teh \t manis  ", "Es Teh Manis"),
        (
            "nasi goreng dan es teh di warung",
            "Nasi Goreng dan Es Teh di Warung",
        ),
        ("the coffee club", "The Coffee Club"),
        ("THE COFFEE CLUB", "The Coffee Club"),
        ("bank of america", "Bank of America"),
        ("ke pasar", "Ke Pasar"),
        ("PT ABC SEJAHTERA", "PT Abc Sejahtera"),
        ("Transfer BCA", "Transfer BCA"),
        ("TRANSFER BCA", "Transfer BCA"),
        ("topup BNI", "Topup BNI"),
        ("cv maju jaya", "Cv Maju Jaya"),
        ("DON'T PANIC", "Don't Panic"),
        ("COCA-COLA", "Coca-Cola"),
        ("CAFÉ LATTE", "Café Latte"),
    ];

    #[test]
    fn should_tidy_every_example() {
        for (raw, tidy) in EXAMPLES {
            assert_eq!(tidy_name(raw), *tidy, "tidy_name({raw:?})");
        }
    }

    #[test]
    fn should_be_idempotent() {
        let extra = [
            "ABC d",
            "a-b",
            "ES TEH (Bottle)",
            "BCA 1L",
            "x",
            "d-EF ABC",
            "🍵 the tea",
        ];
        for raw in EXAMPLES.iter().map(|(raw, _)| *raw).chain(extra) {
            let once = tidy_name(raw);
            assert_eq!(tidy_name(&once), once, "tidy_name twice on {raw:?}");
        }
    }

    #[test]
    fn should_answer_empty_for_empty_and_whitespace() {
        assert_eq!(tidy_name(""), "");
        assert_eq!(tidy_name("   \t\n "), "");
    }

    #[test]
    fn should_leave_text_outside_the_latin_script_alone() {
        assert_eq!(tidy_name("珍珠奶茶"), "珍珠奶茶");
        assert_eq!(tidy_name("МОЛОКО"), "МОЛОКО");
        assert_eq!(tidy_name("ชาไทย"), "ชาไทย");
        assert_eq!(tidy_name("es teh  珍珠"), "Es Teh 珍珠");
    }

    #[test]
    fn should_keep_emoji() {
        assert_eq!(tidy_name("🍵 es teh"), "🍵 Es Teh");
        assert_eq!(tidy_name("kopi ☕"), "Kopi ☕");
    }
}
