//! Debts over MCP: the `/v1/debts` handlers (DEBT-15, D120).
//!
//! The six tools the chat has, with the route's own arguments: a payment's
//! wallet is optional here and nothing is defaulted, as on the web. A debt
//! may name its contact by id or by name; a name is matched or created, as
//! in the chat. `split_bill` is confirmed first, and its first answer is
//! the split the API computed (D122).

use axum::extract::{Json, Path, Query, State};
use chrono::NaiveDate;
use oewang_db::PgPool;
use oewang_domain::{AppError, FieldErrors, Result};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    audit::Actor,
    contacts::service as contacts,
    debts::{
        handler::{
            self as web, split_source, CreateBody, ListQuery, PayBody, SplitBody, TodayQuery,
            UpdateBody,
        },
        service as debts,
    },
    mcp::{
        budget::Spend,
        registry::{
            args, day, id, list_of, money, object, one_of, out, out_created, out_done, out_page,
            string, take_str, Ctx, ToolDef, SOURCE_MCP,
        },
    },
    mcp_handler,
    offline::IfMatch,
};

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "get_outstanding_debts",
        description: "Every unpaid and partly paid debt, soonest due first: contact, type (payable: the person owes; receivable: owed to them), amount, remaining, currency, status and due date, with ids. Plus the totals in the workspace currency and how many are overdue. Figures are formatted by oewang; quote them.",
        spend: Spend::Read,
        schema: || {
            object(
                json!({
                    "today": day("The person's local date, for what counts as overdue. The UTC date when left out.")
                }),
                &[],
            )
        },
        handler: mcp_handler!(outstanding),
    },
    ToolDef {
        name: "create_debt",
        description: "Record money owed between the person and one contact: payable when they owe it, receivable when it is owed to them. Name the contact by contact_id, or by contact_name, which is matched case-insensitively or created. Moves no money. source_transaction_id records the transaction it came from, and its wallet's currency is the default.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "type": one_of(&["payable", "receivable"], "payable: the person owes; receivable: owed to them."),
                    "contact_id": id("contact"),
                    "contact_name": string("The contact's name, when no id is known. Matched or created."),
                    "amount": money("What is owed, in the debt's currency."),
                    "currency_code": string("ISO 4217. The workspace currency when left out."),
                    "due_date": day("When it is due."),
                    "description": string("What it was for."),
                    "source_transaction_id": id("transaction the debt came from")
                }),
                &["type", "amount"],
            )
        },
        handler: mcp_handler!(create),
    },
    ToolDef {
        name: "pay_debt",
        description: "Record a payment on one debt, at most its remaining amount, in the debt's currency. With wallet_id it writes the transaction that moves the money: an expense for a payable debt, income for a receivable one. Without it, nothing moves. A wallet in another currency converts at exchange_rate, or the stored rate when left out.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("debt"),
                    "amount": money("What was paid, in the debt's currency."),
                    "wallet_id": id("wallet the money left or reached"),
                    "date": string("When it was paid, an ISO 8601 timestamp. Now when left out."),
                    "exchange_rate": money("Debt currency to wallet currency, when they differ.")
                }),
                &["id", "amount"],
            )
        },
        handler: mcp_handler!(pay),
    },
    ToolDef {
        name: "update_debt",
        description: "Change a debt's contact, amount, description or due date; send only what changes. The amount cannot go below what is paid, and type and currency are fixed once a payment exists.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("debt"),
                    "contact_id": id("contact"),
                    "type": one_of(&["payable", "receivable"], "Only while the debt has no payment."),
                    "currency_code": string("ISO 4217. Only while the debt has no payment."),
                    "amount": money("The new total owed."),
                    "description": string("What it was for. null clears it."),
                    "due_date": day("When it is due. null clears it.")
                }),
                &["id"],
            )
        },
        handler: mcp_handler!(update),
    },
    ToolDef {
        name: "delete_debt",
        description: "Delete a debt with no payments. Cancel its payments first.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("debt") }), &["id"]),
        handler: mcp_handler!(delete),
    },
    ToolDef {
        name: "split_bill",
        description: "Split an expense equally between the person and 1 to 20 others, recording a receivable for each. Name an existing expense by transaction_id, or send wallet_id, amount, name and date for a new one. Each share is floored to the currency's smallest unit and the person keeps the remainder. Contacts by id or by name; a new name creates a contact. The first call writes nothing and answers with the split as oewang computed it; show it to the person and call again with confirmed: true only after they agree.",
        spend: Spend::Confirmed,
        schema: || {
            object(
                json!({
                    "transaction_id": id("expense to split"),
                    "wallet_id": id("wallet that paid, for a new expense"),
                    "amount": money("The whole bill, for a new expense."),
                    "name": string("What the bill was, for a new expense."),
                    "category_id": id("expense category, for a new expense"),
                    "date": string("When it was paid, an ISO 8601 timestamp, for a new expense."),
                    "contact_names": list_of(json!({ "type": "string" }), "The others by name."),
                    "contact_ids": list_of(json!({ "type": "string" }), "The others by contact id.")
                }),
                &[],
            )
        },
        handler: mcp_handler!(split),
    },
];

async fn outstanding(ctx: Ctx, value: Value) -> Result<Value> {
    let query: TodayQuery = args(value)?;
    let list = ListQuery {
        search: None,
        status: Some("unpaid,partial".into()),
        r#type: None,
        contact_id: None,
        today: query.today.clone(),
        sort: Some("due_date".into()),
        order: Some("asc".into()),
        page: None,
        per_page: Some(100),
    };
    let debts = out_page(
        web::list(
            State(ctx.state.clone()),
            ctx.auth(),
            Query(list),
            ctx.request_id(),
        )
        .await,
    )?;
    let totals = out(web::summary(
        State(ctx.state.clone()),
        ctx.auth(),
        Query(query),
        ctx.request_id(),
    )
    .await)?;
    Ok(json!({ "debts": debts, "totals": totals }))
}

#[derive(Deserialize)]
struct CreateArgs {
    r#type: String,
    contact_id: Option<String>,
    contact_name: Option<String>,
    amount: String,
    currency_code: Option<String>,
    due_date: Option<NaiveDate>,
    description: Option<String>,
    source_transaction_id: Option<String>,
}

async fn create(ctx: Ctx, value: Value) -> Result<Value> {
    let auth = ctx.auth_write()?;
    let input: CreateArgs = args(value)?;
    let contact_id = match (input.contact_id, input.contact_name) {
        (Some(id), None) => id,
        (None, Some(name)) => {
            let actor = Actor {
                workspace_id: &ctx.workspace_id,
                user_id: &ctx.user_id,
                source: SOURCE_MCP,
            };
            contacts::find_or_create_named(&ctx.state.db, actor, &name)
                .await?
                .id
        }
        _ => {
            return Err(AppError::validation([(
                "contact_id",
                "Send contact_id or contact_name, one of them.",
            )]))
        }
    };
    let body = CreateBody {
        id: None,
        r#type: input.r#type,
        contact_id,
        amount: input.amount,
        currency_code: input.currency_code,
        due_date: input.due_date,
        description: input.description,
        source_transaction_id: input.source_transaction_id,
    };
    out_created(web::create(State(ctx.state.clone()), auth, ctx.request_id(), Json(body)).await)
}

async fn pay(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let body: PayBody = args(value)?;
    out_created(
        web::pay(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

async fn update(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let body: UpdateBody = args(value)?;
    out(web::update(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
        IfMatch(None),
        Json(body),
    )
    .await)
}

async fn delete(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out_done(
        web::delete(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
        )
        .await,
    )
}

async fn split(ctx: Ctx, value: Value) -> Result<Value> {
    let body: SplitBody = args(value)?;
    out_created(
        web::split(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

/// The split `split_bill` would write, for its first call (D122).
pub async fn preview_split(
    db: &PgPool,
    workspace_id: &str,
    arguments: &Value,
) -> Result<FieldErrors> {
    let body: SplitBody = args(arguments.clone())?;
    let source = split_source(&body)?;
    let preview = debts::preview_split(
        db,
        workspace_id,
        &source,
        &body.contact_ids,
        &body.contact_names,
    )
    .await?;

    let mut fields = FieldErrors::new();
    fields.insert("people".into(), preview.people_line());
    fields.insert("amount".into(), preview.amount_formatted);
    fields.insert("share_each".into(), preview.share_formatted);
    fields.insert("yours".into(), preview.yours_formatted);
    Ok(fields)
}
