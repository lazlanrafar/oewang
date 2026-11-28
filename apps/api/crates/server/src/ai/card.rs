//! The card a transaction saved from the web chat is answered with.
//!
//! It reads like the Telegram receipt reply (`telegram::reply`) and travels
//! the way a canvas artifact does (D88): built here from the database, left
//! in the turn store under the tool call's id, sent on the stream after the
//! call's result and stored with the assistant message. Every figure is
//! formatted here (D27) and money leaves as a string (D12).
//!
//! A stored card is re-read by id whenever its conversation is read, so an
//! edit made from the card, or anywhere else, shows after a reload, and a
//! deleted row reads as deleted. The month total is not re-read: it is what
//! the reply said at the time.

use oewang_db::{repositories::accounts, PgPool};
use oewang_domain::{format_money, AppError, Result};
use serde_json::{json, Value};

use crate::{
    ai::service::MessageRow, telegram::reply::month_totals, transactions::service as transactions,
};

/// The artifact type the web app draws as a card rather than a canvas.
pub const KIND: &str = "transaction";

/// The card for a row just saved, with this month's expense total.
pub async fn build(pool: &PgPool, workspace_id: &str, transaction_id: &str) -> Result<Value> {
    let mut card = current(pool, workspace_id, transaction_id).await?;

    // The same summary query the Telegram reply uses, so the two agree.
    let (total, _) = month_totals(pool, workspace_id, None).await?;
    let workspace = accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(|error| AppError::Internal(error.into()))?
        .ok_or(AppError::NotFound)?;
    card["month_total_formatted"] = json!(format_money(total, &workspace.currency_code, false));

    Ok(card)
}

/// What the row holds now. `TransactionNotFound` once it is deleted.
async fn current(pool: &PgPool, workspace_id: &str, transaction_id: &str) -> Result<Value> {
    let row = transactions::find(pool, workspace_id, transaction_id).await?;
    let items = transactions::list_items(pool, workspace_id, transaction_id).await?;
    let money = |amount| format_money(amount, &row.wallet_currency_code, false);

    Ok(json!({
        "transaction_id": row.id,
        "type": row.r#type,
        "name": row.name,
        "amount_formatted": money(row.amount),
        "category_id": row.category_id,
        "category_name": row.category_name,
        "wallet_id": row.wallet_id,
        "wallet_name": row.wallet_name,
        "to_wallet_name": row.to_wallet_name,
        "date": row.date.date_naive().to_string(),
        "items": items
            .iter()
            .map(|item| json!({ "name": item.name, "amount_formatted": money(item.amount) }))
            .collect::<Vec<_>>(),
        "deleted": false,
    }))
}

/// Lay what each stored card's row holds now over the stored card.
///
/// A row that cannot be read for any reason but deletion keeps the stored
/// card: a conversation still opens when one card cannot be refreshed.
// shortcut: two queries per card on every conversation read; batch by id if
// a conversation with many cards ever shows up slow.
pub async fn refresh(pool: &PgPool, workspace_id: &str, messages: &mut [MessageRow]) {
    for message in messages {
        let Some(calls) = message
            .attachments
            .as_mut()
            .and_then(|attachments| attachments.get_mut("tool_calls"))
            .and_then(Value::as_array_mut)
        else {
            continue;
        };

        for call in calls {
            let Some(artifact) = call.get_mut("artifact") else {
                continue;
            };
            if artifact.get("type").and_then(Value::as_str) != Some(KIND) {
                continue;
            }
            let Some(card) = artifact.get_mut("payload").and_then(Value::as_object_mut) else {
                continue;
            };
            let Some(id) = card
                .get("transaction_id")
                .and_then(Value::as_str)
                .map(str::to_string)
            else {
                continue;
            };

            match current(pool, workspace_id, &id).await {
                Ok(Value::Object(fields)) => card.extend(fields),
                Ok(_) => {}
                Err(AppError::TransactionNotFound) => {
                    card.insert("deleted".into(), json!(true));
                }
                Err(error) => tracing::warn!(%error, "a chat card could not be re-read"),
            }
        }
    }
}
