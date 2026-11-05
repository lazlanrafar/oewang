//! What the bot says, as plain text.
//!
//! The fixed messages live here so every wording is in one place. The
//! web app's copy goes through a dictionary (UI-1); the bot speaks English
//! only, like the rest of v1, and these constants are its dictionary.
//!
//! Messages go out without `parse_mode` (docs/security/ai-safety.md), so
//! the model's Markdown is reduced to text here before it is sent: links
//! become their label, emphasis markers go, and headings lose their `#`.

/// Telegram refuses a message longer than this.
pub const MAX_MESSAGE_CHARS: usize = 4096;

pub const NOT_LINKED: &str = "This chat isn't connected to Oewang yet.\n\nOpen Oewang, go to Apps → Telegram, and tap Connect. The link it gives you connects this chat to your account.";

pub const LINK_REFUSED: &str = "That link has expired or was already used.\n\nOpen Oewang, go to Apps → Telegram, and tap Connect for a new one.";

pub const PRIVATE_ONLY: &str = "Oewang only works in a private chat with the bot, so nobody else in a group can act on your account.";

pub const DISCONNECTED: &str =
    "This chat is no longer connected to Oewang. Connect it again from Apps → Telegram.";

pub const NO_LONGER_MEMBER: &str =
    "You're no longer a member of that workspace, so this chat has been disconnected.";

pub const HELP: &str = "Send a photo or a PDF of a receipt and I'll save it as an expense.\n\nOr ask me anything about your money, like \"how much did I spend on food this month?\"\n\n/disconnect stops this chat acting for your account.";

pub const MEMBER_CANNOT_WRITE: &str = "Your role in this workspace can't add transactions. Ask an owner or an admin, or ask me questions instead.";

pub const UNSUPPORTED_FILE: &str =
    "I can read receipts as a photo, or as a JPEG, PNG, WebP or PDF file.";

pub const FILE_TOO_LARGE: &str = "That file is too large. Receipts up to 10 MB work.";

pub const RECEIPT_UNREADABLE: &str = "I couldn't read a total or a date on that receipt. Try a sharper photo with the whole receipt in frame.";

pub const NO_ACCOUNT: &str = "There's no account to save this to yet. Add one in Oewang under Accounts, then send the receipt again.";

pub const SOMETHING_WENT_WRONG: &str =
    "Something went wrong on our side. Please try again in a moment.";

pub const AI_UNAVAILABLE: &str =
    "The assistant isn't available right now. Please try again in a moment.";

pub const DELETED: &str = "🗑️ Deleted. It's no longer in your transactions.";

pub const SLOW_DOWN: &str = "That's a lot of messages at once. Please wait a minute and try again.";

pub fn linked(workspace_name: &str) -> String {
    if workspace_name.is_empty() {
        format!("✅ Connected.\n\n{HELP}")
    } else {
        format!("✅ Connected to {workspace_name}.\n\n{HELP}")
    }
}

pub fn currency_mismatch(currency: &str) -> String {
    format!(
        "This receipt is in {currency}, and none of your accounts is. Add a {currency} account in Oewang, or enter it on the web."
    )
}

/// The model's Markdown, as plain text.
///
/// Deliberately small: it removes the syntax the prompt might still
/// produce, it does not parse Markdown. What is left is what a person
/// would read aloud.
pub fn plain(markdown: &str) -> String {
    let mut out = String::with_capacity(markdown.len());

    for line in markdown.lines() {
        let trimmed = line.trim_start();
        // A heading keeps its words.
        let line = if trimmed.starts_with('#') {
            trimmed.trim_start_matches('#').trim_start()
        } else {
            line
        };
        // A bullet reads better as a dot than as a dash or a star.
        let line_owned;
        let line = if let Some(rest) = line
            .trim_start()
            .strip_prefix("- ")
            .or_else(|| line.trim_start().strip_prefix("* "))
        {
            line_owned = format!("• {rest}");
            line_owned.as_str()
        } else {
            line
        };

        out.push_str(
            &strip_links(line)
                .replace("**", "")
                .replace("__", "")
                .replace('`', ""),
        );
        out.push('\n');
    }

    out.trim_end().to_string()
}

/// `[label](target)` becomes `label`. An entity link like `#txn:abc` means
/// nothing outside the web app, and a URL is not something the bot should
/// invite anyone to tap.
fn strip_links(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut rest = line;

    while let Some(open) = rest.find('[') {
        let Some(close) = rest[open..].find("](").map(|i| open + i) else {
            break;
        };
        let Some(end) = rest[close..].find(')').map(|i| close + i) else {
            break;
        };
        out.push_str(&rest[..open]);
        out.push_str(&rest[open + 1..close]);
        rest = &rest[end + 1..];
    }

    out.push_str(rest);
    out
}

/// Split a reply into messages Telegram will accept, on line breaks where
/// possible so a list is not cut mid-item.
pub fn split(text: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut current = String::new();

    for line in text.split_inclusive('\n') {
        if current.chars().count() + line.chars().count() > MAX_MESSAGE_CHARS && !current.is_empty()
        {
            parts.push(std::mem::take(&mut current));
        }
        if line.chars().count() > MAX_MESSAGE_CHARS {
            // One line longer than a message: cut it by characters.
            let chars: Vec<char> = line.chars().collect();
            for chunk in chars.chunks(MAX_MESSAGE_CHARS) {
                parts.push(chunk.iter().collect());
            }
            continue;
        }
        current.push_str(line);
    }

    if !current.trim().is_empty() {
        parts.push(current);
    }
    parts
        .into_iter()
        .map(|part| part.trim_end().to_string())
        .filter(|part| !part.is_empty())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_keep_a_link_label_and_drop_its_target() {
        assert_eq!(
            plain("You spent [Rp 87.500 at Warung](#txn:abc) today."),
            "You spent Rp 87.500 at Warung today."
        );
    }

    #[test]
    fn should_drop_emphasis_and_heading_markers() {
        assert_eq!(plain("## Summary\n**Food**: Rp 10"), "Summary\nFood: Rp 10");
    }

    #[test]
    fn should_turn_list_markers_into_dots() {
        assert_eq!(plain("- one\n* two"), "• one\n• two");
    }

    #[test]
    fn should_leave_plain_text_alone() {
        assert_eq!(plain("Rp 1.000 · Food"), "Rp 1.000 · Food");
    }

    #[test]
    fn should_split_a_long_reply_into_messages_telegram_accepts() {
        let line = format!("{}\n", "a".repeat(100));
        let text = line.repeat(100);
        let parts = split(&text);
        assert!(parts.len() > 1);
        assert!(parts
            .iter()
            .all(|part| part.chars().count() <= MAX_MESSAGE_CHARS));
        assert_eq!(parts.concat().replace('\n', "").len(), 100 * 100);
    }

    #[test]
    fn should_cut_a_single_line_longer_than_a_message() {
        let parts = split(&"b".repeat(MAX_MESSAGE_CHARS + 10));
        assert_eq!(parts.len(), 2);
        assert_eq!(parts[0].chars().count(), MAX_MESSAGE_CHARS);
    }
}
