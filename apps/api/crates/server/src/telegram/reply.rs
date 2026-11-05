//! The "Saved" message a receipt is answered with, and its buttons.
//!
//! Built from the stored transaction rather than from the draft, so the
//! message a button tap rewrites is the same message the receipt got, and
//! what it says is what was saved. Every figure is formatted here (D27);
//! the monthly totals come from the same summary query the web app uses,
//! so the bot and the dashboard cannot disagree.

use chrono::{Datelike, TimeZone, Utc};
use oewang_clients::telegram::{InlineButton, InlineKeyboard};
use oewang_db::{
    repositories::{accounts, categories},
    PgPool,
};
use oewang_domain::{format_money, AppError, Result};
use rust_decimal::Decimal;

use crate::transactions::service::{self as transactions, TransactionFilters};

/// Category buttons per row. Three fit a phone without truncating a short
/// name with an emoji in front of it.
const BUTTONS_PER_ROW: usize = 3;
/// Telegram allows 100 buttons; a keyboard past this many is a wall.
const MAX_CATEGORY_BUTTONS: usize = 24;

pub struct Saved {
    pub text: String,
    pub keyboard: InlineKeyboard,
}

/// What a button asks for. Encoded into `callback_data`, which Telegram
/// caps at 64 bytes: two ids of 24 characters and a prefix fit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Action {
    /// File the transaction under this category.
    Categorize {
        transaction_id: String,
        category_id: String,
    },
    /// Ask before deleting.
    Delete {
        transaction_id: String,
    },
    ConfirmDelete {
        transaction_id: String,
    },
    CancelDelete {
        transaction_id: String,
    },
}

impl Action {
    pub fn encode(&self) -> String {
        match self {
            Action::Categorize {
                transaction_id,
                category_id,
            } => format!("c:{category_id}:{transaction_id}"),
            Action::Delete { transaction_id } => format!("d:{transaction_id}"),
            Action::ConfirmDelete { transaction_id } => format!("dc:{transaction_id}"),
            Action::CancelDelete { transaction_id } => format!("dx:{transaction_id}"),
        }
    }

    /// Anything that does not parse is not acted on. The ids inside are
    /// still only claims: the handler looks each one up in the link's
    /// workspace before touching it.
    pub fn decode(data: &str) -> Option<Self> {
        let id = |value: &str| {
            (!value.is_empty()
                && value.len() <= 32
                && value.chars().all(|c| c.is_ascii_alphanumeric()))
            .then(|| value.to_string())
        };

        let (kind, rest) = data.split_once(':')?;
        match kind {
            "c" => {
                let (category, transaction) = rest.split_once(':')?;
                Some(Action::Categorize {
                    transaction_id: id(transaction)?,
                    category_id: id(category)?,
                })
            }
            "d" => Some(Action::Delete {
                transaction_id: id(rest)?,
            }),
            "dc" => Some(Action::ConfirmDelete {
                transaction_id: id(rest)?,
            }),
            "dx" => Some(Action::CancelDelete {
                transaction_id: id(rest)?,
            }),
            _ => None,
        }
    }
}

/// Everything the message shows, already formatted.
pub struct SavedView<'a> {
    pub name: &'a str,
    pub amount: String,
    pub category: Option<&'a str>,
    pub date: String,
    pub items: Vec<(String, String)>,
    pub month_total: String,
    pub month_category_total: Option<String>,
    /// Fields extraction was unsure of or the arithmetic replaced (AI-11).
    pub check: Vec<String>,
}

/// The message text. Pure, so the format is tested without a database.
pub fn compose(view: &SavedView<'_>) -> String {
    let mut text = format!(
        "✅ Saved {}\n{} · {} · {}",
        view.name,
        view.amount,
        view.category.unwrap_or("Uncategorised"),
        view.date
    );

    if !view.items.is_empty() {
        text.push('\n');
        for (name, amount) in &view.items {
            text.push_str(&format!("\n• {name}  {amount}"));
        }
    }

    text.push_str(&format!("\n\nThis month: {} total", view.month_total));
    match (view.category, &view.month_category_total) {
        (Some(category), Some(total)) => text.push_str(&format!(", {total} on {category}.")),
        _ => text.push('.'),
    }

    if !view.check.is_empty() {
        text.push_str(&format!("\n⚠️ Please check: {}.", view.check.join(", ")));
    }

    text.push_str(if view.category.is_some() {
        "\nWrong category? Tap below."
    } else {
        "\nPick a category below."
    });
    text
}

/// The category buttons, the current one ticked, and Delete last.
pub fn keyboard(
    transaction_id: &str,
    current: Option<&str>,
    categories: &[(String, String)],
) -> InlineKeyboard {
    let buttons: Vec<InlineButton> = categories
        .iter()
        .take(MAX_CATEGORY_BUTTONS)
        .map(|(id, name)| InlineButton {
            text: if current == Some(id.as_str()) {
                format!("✓ {name}")
            } else {
                name.clone()
            },
            callback_data: Action::Categorize {
                transaction_id: transaction_id.to_string(),
                category_id: id.clone(),
            }
            .encode(),
        })
        .collect();

    let mut rows: Vec<Vec<InlineButton>> = buttons
        .chunks(BUTTONS_PER_ROW)
        .map(<[InlineButton]>::to_vec)
        .collect();
    rows.push(vec![InlineButton {
        text: "🗑️ Delete".into(),
        callback_data: Action::Delete {
            transaction_id: transaction_id.to_string(),
        }
        .encode(),
    }]);

    InlineKeyboard {
        inline_keyboard: rows,
    }
}

pub fn confirm_delete_keyboard(transaction_id: &str) -> InlineKeyboard {
    InlineKeyboard {
        inline_keyboard: vec![vec![
            InlineButton {
                text: "🗑️ Yes, delete it".into(),
                callback_data: Action::ConfirmDelete {
                    transaction_id: transaction_id.to_string(),
                }
                .encode(),
            },
            InlineButton {
                text: "Keep it".into(),
                callback_data: Action::CancelDelete {
                    transaction_id: transaction_id.to_string(),
                }
                .encode(),
            },
        ]],
    }
}

/// The saved transaction, as a message and buttons, read back from the
/// database.
pub async fn saved(
    pool: &PgPool,
    workspace_id: &str,
    transaction_id: &str,
    check: &[String],
) -> Result<Saved> {
    let row = transactions::find(pool, workspace_id, transaction_id).await?;
    let items = transactions::list_items(pool, workspace_id, transaction_id).await?;
    let workspace = accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let expense_categories: Vec<(String, String)> =
        categories::list_categories(pool, workspace_id, Some("expense"))
            .await
            .map_err(internal)?
            .into_iter()
            .map(|category| (category.id, category.name))
            .collect();

    let (month_total, month_category_total) =
        month_totals(pool, workspace_id, row.category_id.as_deref()).await?;

    let name = row.name.clone().unwrap_or_else(|| "Receipt".into());
    let text = compose(&SavedView {
        name: &name,
        amount: format_money(row.amount, &row.wallet_currency_code, false),
        category: row.category_name.as_deref(),
        date: row.date.date_naive().to_string(),
        items: items
            .iter()
            .map(|item| {
                (
                    item.name.clone(),
                    format_money(item.amount, &row.wallet_currency_code, false),
                )
            })
            .collect(),
        month_total: format_money(month_total, &workspace.currency_code, false),
        month_category_total: month_category_total
            .map(|total| format_money(total, &workspace.currency_code, false)),
        check: check.to_vec(),
    });

    Ok(Saved {
        text,
        keyboard: keyboard(
            transaction_id,
            row.category_id.as_deref(),
            &expense_categories,
        ),
    })
}

/// This month's expense total and, when given, one category's, in the
/// workspace currency. The month is UTC's, as every date the API works
/// out is: the data model holds no workspace timezone.
async fn month_totals(
    pool: &PgPool,
    workspace_id: &str,
    category_id: Option<&str>,
) -> Result<(Decimal, Option<Decimal>)> {
    let now = Utc::now();
    let start = Utc
        .with_ymd_and_hms(now.year(), now.month(), 1, 0, 0, 0)
        .single()
        .ok_or_else(|| internal(anyhow::anyhow!("no first day of the month")))?;

    let filters = TransactionFilters {
        kind: Some("expense"),
        start_date: Some(start),
        ..TransactionFilters::default()
    };

    let (by_type, by_category) = transactions::summary(pool, workspace_id, &filters).await?;

    let total = by_type
        .iter()
        .find(|row| row.r#type == "expense")
        .map(|row| row.total)
        .unwrap_or_default();
    let category_total = category_id.map(|id| {
        by_category
            .iter()
            .filter(|row| row.category_id.as_deref() == Some(id) && row.r#type == "expense")
            .map(|row| row.total)
            .sum()
    });

    Ok((total, category_total))
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn view() -> SavedView<'static> {
        SavedView {
            name: "🍜 HOLAN BY MEVUI",
            amount: "Rp 136.850".into(),
            category: Some("🍜 Food"),
            date: "2026-10-23".into(),
            items: vec![
                ("MINERAL WATER (Bottle)".into(), "Rp 20.000".into()),
                ("PHO SG - SPECIAL".into(), "Rp 81.000".into()),
            ],
            month_total: "Rp 136.850".into(),
            month_category_total: Some("Rp 136.850".into()),
            check: vec![],
        }
    }

    #[test]
    fn should_read_like_the_receipt_reply_the_owner_asked_for() {
        assert_eq!(
            compose(&view()),
            "✅ Saved 🍜 HOLAN BY MEVUI\nRp 136.850 · 🍜 Food · 2026-10-23\n\n\
             • MINERAL WATER (Bottle)  Rp 20.000\n• PHO SG - SPECIAL  Rp 81.000\n\n\
             This month: Rp 136.850 total, Rp 136.850 on 🍜 Food.\nWrong category? Tap below."
        );
    }

    #[test]
    fn should_ask_for_a_category_when_none_was_chosen() {
        let mut view = view();
        view.category = None;
        view.month_category_total = None;
        let text = compose(&view);
        assert!(text.contains("· Uncategorised ·"));
        assert!(text.contains("This month: Rp 136.850 total."));
        assert!(text.ends_with("Pick a category below."));
    }

    #[test]
    fn should_name_what_to_check() {
        let mut view = view();
        view.check = vec!["total".into(), "date".into()];
        assert!(compose(&view).contains("⚠️ Please check: total, date."));
    }

    #[test]
    fn should_tick_the_current_category_and_end_with_delete() {
        let categories = vec![
            ("cat1".to_string(), "🍜 Food".to_string()),
            ("cat2".to_string(), "🧾 Bills".to_string()),
        ];
        let keyboard = keyboard("txn1", Some("cat2"), &categories);
        assert_eq!(keyboard.inline_keyboard[0][1].text, "✓ 🧾 Bills");
        assert_eq!(
            keyboard.inline_keyboard.last().unwrap()[0].callback_data,
            "d:txn1"
        );
    }

    #[test]
    fn should_fit_callback_data_in_sixty_four_bytes() {
        let id = "a".repeat(24);
        let data = Action::Categorize {
            transaction_id: id.clone(),
            category_id: id,
        }
        .encode();
        assert!(data.len() <= 64);
    }

    #[test]
    fn should_round_trip_every_action() {
        for action in [
            Action::Categorize {
                transaction_id: "t1".into(),
                category_id: "c1".into(),
            },
            Action::Delete {
                transaction_id: "t1".into(),
            },
            Action::ConfirmDelete {
                transaction_id: "t1".into(),
            },
            Action::CancelDelete {
                transaction_id: "t1".into(),
            },
        ] {
            assert_eq!(Action::decode(&action.encode()), Some(action));
        }
    }

    #[test]
    fn should_refuse_callback_data_it_did_not_make() {
        assert_eq!(Action::decode("x:t1"), None);
        assert_eq!(Action::decode("d:"), None);
        assert_eq!(Action::decode("d:../../etc"), None);
        assert_eq!(Action::decode("c:onlyone"), None);
    }
}
