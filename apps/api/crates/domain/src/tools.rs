//! The tool catalog, as rules rather than as a dispatch table.
//!
//! Twenty-one tools (D17, D88, D103, D120). What lives here is everything about them that needs
//! no database: which exist, which write, what each one accepts, and the
//! per-turn caps. Execution lives in the server crate, because that is where
//! the services are.
//!
//! The arguments arrive as JSON a model produced, which makes them untrusted
//! input like any other (docs/security/ai-safety.md#output-handling). They
//! are parsed into typed values here, once, before anything reads them, and
//! an unknown key is an error rather than something to ignore: a model that
//! invented a parameter is a model that misunderstood the call, and silently
//! dropping it would turn that into a wrong write.
//!
//! Money arrives as a string and is parsed with `Decimal`, never a float
//! (D12). A JSON number in an amount position is refused rather than
//! accepted, because by the time it reached here it had already been through
//! a double.

use std::str::FromStr;

use chrono::{DateTime, NaiveDate, NaiveTime, TimeZone, Utc};
use rust_decimal::Decimal;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};

use crate::{budget::Month, AppError, FieldErrors, Role};

// ------------------------------------------------------------------- caps

/// Per-turn blast radius, enforced in the API whatever the model asks for
/// (D25, docs/security/ai-safety.md#layer-2-blast-radius).
pub const MAX_WRITES_PER_TURN: u32 = 3;
pub const MAX_DELETES_PER_TURN: u32 = 1;
pub const MAX_CREATED_TRANSACTIONS_PER_TURN: u32 = 3;

/// How long a challenge for one row, or one split, stays answerable (CHAT-6,
/// D122).
pub const CONFIRMATION_TTL_SECS: i64 = 5 * 60;

/// The default ceiling on an amount a tool may write, in the wallet's own
/// currency. A parse error that shifts a decimal point stops here. The
/// deployment may lower it; `CHAT_MAX_TOOL_AMOUNT` is the variable.
pub fn default_max_tool_amount() -> Decimal {
    Decimal::new(100_000_000, 0)
}

/// How many bytes of tool result one call may return.
///
/// A list longer than this is cut and says so, because a model handed a
/// quietly shortened list reports a wrong total
/// (docs/ai/service.md#tool-result-shape).
pub const RESULT_BYTE_BUDGET: usize = 8 * 1024;

// ----------------------------------------------------------------- catalog

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Tool {
    GetWorkspaceContext,
    GetRecentTransactions,
    SearchTransactions,
    GetSpendingSummary,
    GetSpendingAnalysis,
    GetIncomeSummary,
    GetBurnRate,
    GetBudgetStatus,
    GetOutstandingDebts,
    CreateTransaction,
    UpdateTransaction,
    DeleteTransaction,
    AddTransactionItems,
    CreateWallet,
    CreateCategory,
    CreateDebt,
    PayDebt,
    UpdateDebt,
    DeleteDebt,
    SplitBill,
    PresentChoices,
}

impl Tool {
    pub const ALL: [Tool; 21] = [
        Tool::GetWorkspaceContext,
        Tool::GetRecentTransactions,
        Tool::SearchTransactions,
        Tool::GetSpendingSummary,
        Tool::GetSpendingAnalysis,
        Tool::GetIncomeSummary,
        Tool::GetBurnRate,
        Tool::GetBudgetStatus,
        Tool::GetOutstandingDebts,
        Tool::CreateTransaction,
        Tool::UpdateTransaction,
        Tool::DeleteTransaction,
        Tool::AddTransactionItems,
        Tool::CreateWallet,
        Tool::CreateCategory,
        Tool::CreateDebt,
        Tool::PayDebt,
        Tool::UpdateDebt,
        Tool::DeleteDebt,
        Tool::SplitBill,
        Tool::PresentChoices,
    ];

    pub fn name(self) -> &'static str {
        match self {
            Tool::GetWorkspaceContext => "get_workspace_context",
            Tool::GetRecentTransactions => "get_recent_transactions",
            Tool::SearchTransactions => "search_transactions",
            Tool::GetSpendingSummary => "get_spending_summary",
            Tool::GetSpendingAnalysis => "get_spending_analysis",
            Tool::GetIncomeSummary => "get_income_summary",
            Tool::GetBurnRate => "get_burn_rate",
            Tool::GetBudgetStatus => "get_budget_status",
            Tool::GetOutstandingDebts => "get_outstanding_debts",
            Tool::CreateTransaction => "create_transaction",
            Tool::UpdateTransaction => "update_transaction",
            Tool::DeleteTransaction => "delete_transaction",
            Tool::AddTransactionItems => "add_transaction_items",
            Tool::CreateWallet => "create_wallet",
            Tool::CreateCategory => "create_category",
            Tool::CreateDebt => "create_debt",
            Tool::PayDebt => "pay_debt",
            Tool::UpdateDebt => "update_debt",
            Tool::DeleteDebt => "delete_debt",
            Tool::SplitBill => "split_bill",
            Tool::PresentChoices => "present_choices",
        }
    }

    pub fn parse(name: &str) -> Result<Self, AppError> {
        Tool::ALL
            .into_iter()
            .find(|tool| tool.name() == name)
            .ok_or(AppError::ToolNotFound)
    }

    /// Does this tool change workspace data?
    ///
    /// `present_choices` does not: it asks the user a question and is
    /// answered by the next turn, so it costs nothing against the caps.
    pub fn is_write(self) -> bool {
        matches!(
            self,
            Tool::CreateTransaction
                | Tool::UpdateTransaction
                | Tool::DeleteTransaction
                | Tool::AddTransactionItems
                | Tool::CreateWallet
                | Tool::CreateCategory
                | Tool::CreateDebt
                | Tool::PayDebt
                | Tool::UpdateDebt
                | Tool::DeleteDebt
                | Tool::SplitBill
        )
    }

    pub fn is_delete(self) -> bool {
        matches!(self, Tool::DeleteTransaction | Tool::DeleteDebt)
    }

    /// A payment writes the transaction that moves its money, and a split
    /// writes the expense it divides, so both count against the turn's
    /// created transactions as `create_transaction` does (D25).
    pub fn creates_transaction(self) -> bool {
        matches!(
            self,
            Tool::CreateTransaction | Tool::PayDebt | Tool::SplitBill
        )
    }

    /// Whether a call runs only after the person agreed in a later turn
    /// (D20). The two deletes, and `split_bill`, which writes up to
    /// [`MAX_SPLIT_CONTACTS`] debts in one call (D122).
    pub fn needs_confirmation(self) -> bool {
        matches!(
            self,
            Tool::DeleteTransaction | Tool::DeleteDebt | Tool::SplitBill
        )
    }

    /// Whether the live membership row allows this tool. A write needs
    /// admin or owner; everything else takes any member (CHAT-4).
    pub fn allowed_for(self, role: Role) -> bool {
        !self.is_write() || role.can_write()
    }
}

// -------------------------------------------------------------- parsed call

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ToolCall {
    GetWorkspaceContext,
    GetRecentTransactions(RecentArgs),
    SearchTransactions(SearchArgs),
    GetSpendingSummary(SummaryArgs),
    /// The three analysis tools. Each answers the model and also hands the
    /// web app a canvas artifact the API built (D88).
    GetSpendingAnalysis(RangeArgs),
    GetIncomeSummary(RangeArgs),
    GetBurnRate(RangeArgs),
    /// Budget against spending for one month, with a `budget` canvas
    /// (D103). `None` is the current month.
    GetBudgetStatus(Option<Month>),
    /// Unpaid and partial debts (D120). No arguments, as in the old app.
    GetOutstandingDebts,
    CreateTransaction(WriteTransactionArgs),
    UpdateTransaction(WriteTransactionArgs),
    DeleteTransaction(DeleteArgs),
    AddTransactionItems(ItemsArgs),
    CreateWallet(NewWalletArgs),
    CreateCategory(NewCategoryArgs),
    CreateDebt(NewDebtArgs),
    PayDebt(PayDebtArgs),
    UpdateDebt(UpdateDebtArgs),
    DeleteDebt(DeleteDebtArgs),
    SplitBill(SplitBillArgs),
    PresentChoices(ChoicesArgs),
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct RecentArgs {
    pub limit: Option<u32>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct SearchArgs {
    pub query: Option<String>,
    pub kind: Option<String>,
    pub category_id: Option<String>,
    pub wallet_id: Option<String>,
    pub min_amount: Option<Decimal>,
    pub max_amount: Option<Decimal>,
    pub from: Option<DateTime<Utc>>,
    pub to: Option<DateTime<Utc>>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SummaryGrouping {
    Category,
    Wallet,
    Type,
    Month,
}

impl SummaryGrouping {
    fn parse(raw: &str) -> Option<Self> {
        match raw {
            "category" => Some(SummaryGrouping::Category),
            "wallet" => Some(SummaryGrouping::Wallet),
            "type" => Some(SummaryGrouping::Type),
            "month" => Some(SummaryGrouping::Month),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            SummaryGrouping::Category => "category",
            SummaryGrouping::Wallet => "wallet",
            SummaryGrouping::Type => "type",
            SummaryGrouping::Month => "month",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SummaryArgs {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
    pub group_by: SummaryGrouping,
}

/// A closed date range, both ends required.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RangeArgs {
    pub from: DateTime<Utc>,
    pub to: DateTime<Utc>,
}

/// What a create or an update asks for.
///
/// One struct for both, because the fields are the same set; what differs is
/// which are required, and that is checked per tool rather than per field.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct WriteTransactionArgs {
    pub transaction_id: Option<String>,
    pub kind: Option<String>,
    pub amount: Option<Decimal>,
    pub to_amount: Option<Decimal>,
    pub wallet_id: Option<String>,
    pub to_wallet_id: Option<String>,
    pub category_id: Option<String>,
    pub date: Option<DateTime<Utc>>,
    pub name: Option<String>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteArgs {
    pub transaction_id: String,
    /// A claim the API honours only for an id it has already challenged
    /// (D20). The flag on a first call means nothing.
    pub confirmed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemArg {
    pub name: String,
    pub amount: Decimal,
    pub quantity: Option<Decimal>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ItemsArgs {
    pub transaction_id: String,
    pub items: Vec<ItemArg>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewWalletArgs {
    pub name: String,
    pub group_id: Option<String>,
    pub currency_code: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewCategoryArgs {
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChoicesArgs {
    pub question: String,
    pub choices: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NewDebtArgs {
    /// `payable` or `receivable`.
    pub kind: String,
    /// Matched to a live contact case-insensitively, or created (DEBT-14).
    pub contact_name: String,
    /// In the debt's currency.
    pub amount: Decimal,
    /// `None` is the workspace currency.
    pub currency_code: Option<String>,
    pub description: Option<String>,
    pub due_date: Option<NaiveDate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PayDebtArgs {
    pub debt_id: String,
    /// In the debt's currency.
    pub amount: Decimal,
    /// `None` is the default wallet, as in the old app.
    pub wallet_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateDebtArgs {
    pub debt_id: String,
    pub amount: Option<Decimal>,
    pub description: Option<String>,
    pub due_date: Option<NaiveDate>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeleteDebtArgs {
    pub debt_id: String,
    /// A claim, honoured only for a debt already challenged (D20).
    pub confirmed: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SplitBillArgs {
    /// The whole bill, in the wallet's currency.
    pub amount: Decimal,
    /// The expense's name.
    pub name: String,
    /// `None` is the default wallet.
    pub wallet_id: Option<String>,
    pub category_id: Option<String>,
    /// The other people, 1 to [`MAX_SPLIT_CONTACTS`]. The person is never in
    /// the list; their share is what is left.
    pub contact_names: Vec<String>,
    /// A claim, honoured only for this exact split already challenged (D122).
    pub confirmed: bool,
}

impl SplitBillArgs {
    /// The challenge key: a hash of what the split would write (D122).
    ///
    /// A split has no row yet, so the key cannot be an id. It is taken over
    /// the parsed arguments rather than the raw JSON, so reordering keys or
    /// names, or changing a name's case, answers the same challenge, while
    /// any change to who or how much does not.
    pub fn challenge_key(&self) -> String {
        let mut names: Vec<String> = self
            .contact_names
            .iter()
            .map(|name| name.to_lowercase())
            .collect();
        names.sort();
        names.dedup();

        let mut hasher = Sha256::new();
        let parts = [
            self.amount.normalize().to_string(),
            self.name.clone(),
            self.wallet_id.clone().unwrap_or_default(),
            self.category_id.clone().unwrap_or_default(),
        ];
        // A zero byte after every part, which no cleaned argument can hold,
        // so ("ab", "c") and ("a", "bc") never hash alike.
        for part in parts.iter().chain(names.iter()) {
            hasher.update(part.as_bytes());
            hasher.update([0u8]);
        }

        let digest: String = hasher
            .finalize()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        format!("split:{digest}")
    }
}

/// The most people one split may name besides the person (DEBT-10).
pub const MAX_SPLIT_CONTACTS: usize = 20;

/// The most line items one call may add. A receipt longer than this is a
/// statement, and statements have their own path.
pub const MAX_ITEMS: usize = 50;
/// The most options a disambiguation question may offer.
pub const MAX_CHOICES: usize = 10;
const MAX_TEXT: usize = 500;
const MAX_ID: usize = 64;

impl ToolCall {
    /// Parse and validate one call's arguments.
    ///
    /// Every field is checked before any is used, so the model is told
    /// everything that is wrong in one answer rather than one thing per
    /// round.
    pub fn parse(tool: Tool, args: &Value) -> Result<Self, AppError> {
        let mut reader = Reader::new(args)?;

        let call = match tool {
            Tool::GetWorkspaceContext => ToolCall::GetWorkspaceContext,

            Tool::GetRecentTransactions => ToolCall::GetRecentTransactions(RecentArgs {
                limit: reader.int("limit", 1, 50).map(|value| value as u32),
                from: reader.date("from"),
                to: reader.date("to"),
            }),

            Tool::SearchTransactions => ToolCall::SearchTransactions(SearchArgs {
                query: reader.text("query"),
                kind: reader.one_of("type", &["income", "expense", "transfer"]),
                category_id: reader.id("category_id"),
                wallet_id: reader.id("wallet_id"),
                min_amount: reader.amount("min_amount"),
                max_amount: reader.amount("max_amount"),
                from: reader.date("from"),
                to: reader.date("to"),
                limit: reader.int("limit", 1, 50).map(|value| value as u32),
            }),

            Tool::GetSpendingSummary => {
                let range = reader.range();
                let group_by = reader.one_of("group_by", &["category", "wallet", "type", "month"]);

                ToolCall::GetSpendingSummary(SummaryArgs {
                    from: range.from,
                    to: range.to,
                    group_by: group_by
                        .as_deref()
                        .and_then(SummaryGrouping::parse)
                        .unwrap_or(SummaryGrouping::Category),
                })
            }

            Tool::GetSpendingAnalysis => ToolCall::GetSpendingAnalysis(reader.range()),
            Tool::GetIncomeSummary => ToolCall::GetIncomeSummary(reader.range()),
            Tool::GetBurnRate => ToolCall::GetBurnRate(reader.range()),
            Tool::GetBudgetStatus => ToolCall::GetBudgetStatus(reader.month("month")),
            Tool::GetOutstandingDebts => ToolCall::GetOutstandingDebts,

            Tool::CreateTransaction => {
                let args = reader.transaction(false);
                reader.require("type", args.kind.is_some());
                reader.require("amount", args.amount.is_some());
                reader.require("wallet_id", args.wallet_id.is_some());
                ToolCall::CreateTransaction(args)
            }

            Tool::UpdateTransaction => {
                let args = reader.transaction(true);
                reader.require("transaction_id", args.transaction_id.is_some());
                ToolCall::UpdateTransaction(args)
            }

            Tool::DeleteTransaction => {
                let transaction_id = reader.id("transaction_id");
                let confirmed = reader.flag("confirmed");
                reader.require("transaction_id", transaction_id.is_some());

                ToolCall::DeleteTransaction(DeleteArgs {
                    transaction_id: transaction_id.unwrap_or_default(),
                    confirmed,
                })
            }

            Tool::AddTransactionItems => {
                let transaction_id = reader.id("transaction_id");
                let items = reader.items("items");
                reader.require("transaction_id", transaction_id.is_some());
                reader.require("items", !items.is_empty());

                ToolCall::AddTransactionItems(ItemsArgs {
                    transaction_id: transaction_id.unwrap_or_default(),
                    items,
                })
            }

            Tool::CreateWallet => {
                let name = reader.text("name");
                let group_id = reader.id("group_id");
                let currency_code = reader.text("currency_code");
                reader.require("name", name.is_some());

                ToolCall::CreateWallet(NewWalletArgs {
                    name: name.unwrap_or_default(),
                    group_id,
                    currency_code,
                })
            }

            Tool::CreateCategory => {
                let name = reader.text("name");
                let kind = reader.one_of("type", &["income", "expense"]);
                reader.require("name", name.is_some());
                reader.require("type", kind.is_some());

                ToolCall::CreateCategory(NewCategoryArgs {
                    name: name.unwrap_or_default(),
                    kind: kind.unwrap_or_default(),
                })
            }

            Tool::CreateDebt => {
                let kind = reader.one_of("type", &["payable", "receivable"]);
                let contact_name = reader.text("contact_name");
                let amount = reader.amount("amount");
                let currency_code = reader.text("currency_code");
                let description = reader.text("description");
                let due_date = reader.date("due_date").map(|stamp| stamp.date_naive());
                reader.require("type", kind.is_some());
                reader.require("contact_name", contact_name.is_some());
                reader.require("amount", amount.is_some());

                ToolCall::CreateDebt(NewDebtArgs {
                    kind: kind.unwrap_or_default(),
                    contact_name: contact_name.unwrap_or_default(),
                    amount: amount.unwrap_or_default(),
                    currency_code,
                    description,
                    due_date,
                })
            }

            Tool::PayDebt => {
                let debt_id = reader.id("debt_id");
                let amount = reader.amount("amount");
                let wallet_id = reader.id("wallet_id");
                reader.require("debt_id", debt_id.is_some());
                reader.require("amount", amount.is_some());

                ToolCall::PayDebt(PayDebtArgs {
                    debt_id: debt_id.unwrap_or_default(),
                    amount: amount.unwrap_or_default(),
                    wallet_id,
                })
            }

            Tool::UpdateDebt => {
                let debt_id = reader.id("debt_id");
                let amount = reader.amount("amount");
                let description = reader.text("description");
                let due_date = reader.date("due_date").map(|stamp| stamp.date_naive());
                reader.require("debt_id", debt_id.is_some());

                ToolCall::UpdateDebt(UpdateDebtArgs {
                    debt_id: debt_id.unwrap_or_default(),
                    amount,
                    description,
                    due_date,
                })
            }

            Tool::DeleteDebt => {
                let debt_id = reader.id("debt_id");
                let confirmed = reader.flag("confirmed");
                reader.require("debt_id", debt_id.is_some());

                ToolCall::DeleteDebt(DeleteDebtArgs {
                    debt_id: debt_id.unwrap_or_default(),
                    confirmed,
                })
            }

            Tool::SplitBill => {
                let amount = reader.amount("amount");
                let name = reader.text("name");
                let wallet_id = reader.id("wallet_id");
                let category_id = reader.id("category_id");
                let contact_names = reader.strings("contact_names", MAX_SPLIT_CONTACTS);
                let confirmed = reader.flag("confirmed");
                reader.require("amount", amount.is_some());
                reader.require("name", name.is_some());
                reader.require("contact_names", !contact_names.is_empty());

                ToolCall::SplitBill(SplitBillArgs {
                    amount: amount.unwrap_or_default(),
                    name: name.unwrap_or_default(),
                    wallet_id,
                    category_id,
                    contact_names,
                    confirmed,
                })
            }

            Tool::PresentChoices => {
                let question = reader.text("question");
                let choices = reader.strings("choices", MAX_CHOICES);
                reader.require("question", question.is_some());
                reader.require("choices", choices.len() >= 2);

                ToolCall::PresentChoices(ChoicesArgs {
                    question: question.unwrap_or_default(),
                    choices,
                })
            }
        };

        reader.finish()?;
        Ok(call)
    }

    /// What a confirmation is keyed by, for a call that needs one (D20,
    /// D122), with whether the model claims the person already agreed.
    ///
    /// A transaction's key is its bare id, as it has been since D20. A
    /// debt's is prefixed, so a challenge on one kind of row never answers
    /// for the other; a split's is the hash of its arguments.
    pub fn confirmation(&self) -> Option<(String, bool)> {
        match self {
            ToolCall::DeleteTransaction(args) => {
                Some((args.transaction_id.clone(), args.confirmed))
            }
            ToolCall::DeleteDebt(args) => Some((format!("debt:{}", args.debt_id), args.confirmed)),
            ToolCall::SplitBill(args) => Some((args.challenge_key(), args.confirmed)),
            _ => None,
        }
    }
}

// ------------------------------------------------------------------ reader

/// Reads one argument object, collecting every problem rather than stopping
/// at the first.
struct Reader<'a> {
    fields: Option<&'a Map<String, Value>>,
    seen: Vec<&'static str>,
    errors: FieldErrors,
}

impl<'a> Reader<'a> {
    fn new(args: &'a Value) -> Result<Self, AppError> {
        // `null` and an absent argument object both mean "no arguments",
        // which is a legitimate call for a tool that takes none.
        let fields = match args {
            Value::Object(map) => Some(map),
            Value::Null => None,
            _ => {
                return Err(AppError::ToolArgsInvalid(
                    [(
                        "args".to_string(),
                        "Arguments must be an object.".to_string(),
                    )]
                    .into_iter()
                    .collect(),
                ))
            }
        };

        Ok(Self {
            fields,
            seen: Vec::new(),
            errors: FieldErrors::new(),
        })
    }

    /// The raw value, or `None` when the key is absent or explicitly null.
    ///
    /// A model that fills every parameter with `null` is asking for the
    /// default, not for a validation error.
    fn get(&mut self, name: &'static str) -> Option<&'a Value> {
        self.seen.push(name);
        match self.fields.and_then(|fields| fields.get(name)) {
            None | Some(Value::Null) => None,
            Some(value) => Some(value),
        }
    }

    fn reject(&mut self, name: &'static str, message: &str) {
        self.errors
            .entry(name.to_string())
            .or_insert_with(|| message.to_string());
    }

    fn require(&mut self, name: &'static str, present: bool) {
        if !present {
            self.reject(name, "This argument is required.");
        }
    }

    fn text(&mut self, name: &'static str) -> Option<String> {
        match self.get(name)? {
            Value::String(raw) => {
                let cleaned: String = raw
                    .chars()
                    .filter(|c| !c.is_control())
                    .take(MAX_TEXT)
                    .collect();
                let cleaned = cleaned.trim().to_string();
                if cleaned.is_empty() {
                    self.reject(name, "This argument cannot be empty.");
                    None
                } else {
                    Some(cleaned)
                }
            }
            _ => {
                self.reject(name, "Expected a string.");
                None
            }
        }
    }

    /// An identifier, which is a string with a tighter bound. Nothing is
    /// looked up here; an id that does not exist is the service's answer.
    fn id(&mut self, name: &'static str) -> Option<String> {
        let value = self.text(name)?;
        if value.chars().count() > MAX_ID {
            self.reject(name, "That is not an id.");
            return None;
        }
        Some(value)
    }

    fn one_of(&mut self, name: &'static str, allowed: &[&'static str]) -> Option<String> {
        let value = self.text(name)?;
        if allowed.contains(&value.as_str()) {
            Some(value)
        } else {
            let message = format!("Expected one of: {}.", allowed.join(", "));
            self.reject(name, &message);
            None
        }
    }

    /// An amount, as a string (D12).
    ///
    /// A JSON number is refused rather than converted: it has already been
    /// through a double by the time it arrives, and the whole point of the
    /// string on the wire is that no amount ever does.
    fn amount(&mut self, name: &'static str) -> Option<Decimal> {
        match self.get(name)? {
            Value::String(raw) => match Decimal::from_str(raw.trim()) {
                Ok(value) => Some(value),
                Err(_) => {
                    self.reject(name, "Expected a decimal amount as a string.");
                    None
                }
            },
            Value::Number(_) => {
                self.reject(name, "An amount is a string, never a number.");
                None
            }
            _ => {
                self.reject(name, "Expected a decimal amount as a string.");
                None
            }
        }
    }

    /// ISO 8601: a plain date, or a full timestamp.
    ///
    /// A plain date is read as midnight UTC, which is how the rest of the
    /// product reads one. The workspace's display format never reaches a
    /// tool argument (docs/ai/service.md#system-prompt).
    /// `from` and `to`, both required and in order.
    ///
    /// A missing end is rejected rather than defaulted, so the caller's
    /// errors carry it; the placeholder `now` below is never executed
    /// against, because a reader with a rejection fails the whole parse.
    fn range(&mut self) -> RangeArgs {
        let from = self.date("from");
        let to = self.date("to");

        self.require("from", from.is_some());
        self.require("to", to.is_some());

        if let (Some(from), Some(to)) = (from, to) {
            if from > to {
                self.reject("from", "The start of the range is after its end.");
            }
        }

        RangeArgs {
            from: from.unwrap_or_else(Utc::now),
            to: to.unwrap_or_else(Utc::now),
        }
    }

    /// A calendar month as `YYYY-MM`.
    fn month(&mut self, name: &'static str) -> Option<Month> {
        let raw = match self.get(name)? {
            Value::String(raw) => raw,
            _ => {
                self.reject(name, "Expected a month as YYYY-MM.");
                return None;
            }
        };
        let month = Month::parse(raw);
        if month.is_none() {
            self.reject(name, "Expected a month as YYYY-MM, for example 2026-11.");
        }
        month
    }

    fn date(&mut self, name: &'static str) -> Option<DateTime<Utc>> {
        let raw = match self.get(name)? {
            Value::String(raw) => raw.trim().to_string(),
            _ => {
                self.reject(name, "Expected an ISO 8601 date.");
                return None;
            }
        };

        if let Ok(stamp) = DateTime::parse_from_rfc3339(&raw) {
            return Some(stamp.with_timezone(&Utc));
        }

        if let Ok(date) = NaiveDate::parse_from_str(&raw, "%Y-%m-%d") {
            let midnight = date.and_time(NaiveTime::MIN);
            return Some(Utc.from_utc_datetime(&midnight));
        }

        self.reject(name, "Expected an ISO 8601 date, for example 2026-11-03.");
        None
    }

    fn int(&mut self, name: &'static str, min: i64, max: i64) -> Option<i64> {
        let value = match self.get(name)? {
            Value::Number(number) => number.as_i64(),
            // A model that quoted a count is understood; a model that
            // quoted an amount is not, which is the asymmetry D12 wants.
            Value::String(raw) => raw.trim().parse::<i64>().ok(),
            _ => None,
        };

        match value {
            Some(value) if (min..=max).contains(&value) => Some(value),
            Some(_) => {
                let message = format!("Expected a whole number between {min} and {max}.");
                self.reject(name, &message);
                None
            }
            None => {
                self.reject(name, "Expected a whole number.");
                None
            }
        }
    }

    fn flag(&mut self, name: &'static str) -> bool {
        match self.get(name) {
            Some(Value::Bool(value)) => *value,
            None => false,
            Some(_) => {
                self.reject(name, "Expected true or false.");
                false
            }
        }
    }

    fn strings(&mut self, name: &'static str, max: usize) -> Vec<String> {
        let Some(value) = self.get(name) else {
            return Vec::new();
        };

        let Value::Array(raw) = value else {
            self.reject(name, "Expected a list.");
            return Vec::new();
        };

        if raw.len() > max {
            let message = format!("At most {max} are accepted.");
            self.reject(name, &message);
            return Vec::new();
        }

        let mut out = Vec::with_capacity(raw.len());
        for entry in raw {
            match entry {
                Value::String(text) => {
                    let cleaned: String = text
                        .chars()
                        .filter(|c| !c.is_control())
                        .take(MAX_TEXT)
                        .collect();
                    let cleaned = cleaned.trim().to_string();
                    if cleaned.is_empty() {
                        self.reject(name, "An entry cannot be empty.");
                    } else {
                        out.push(cleaned);
                    }
                }
                _ => self.reject(name, "Every entry must be a string."),
            }
        }

        out
    }

    fn items(&mut self, name: &'static str) -> Vec<ItemArg> {
        let Some(value) = self.get(name) else {
            return Vec::new();
        };

        let Value::Array(raw) = value else {
            self.reject(name, "Expected a list of items.");
            return Vec::new();
        };

        if raw.len() > MAX_ITEMS {
            let message = format!("At most {MAX_ITEMS} items are accepted in one call.");
            self.reject(name, &message);
            return Vec::new();
        }

        let mut out = Vec::with_capacity(raw.len());

        for entry in raw {
            let Value::Object(fields) = entry else {
                self.reject(name, "Every item must be an object.");
                continue;
            };

            // An item's keys are checked like the call's own: a stray key
            // means the model meant something this tool cannot do.
            if fields
                .keys()
                .any(|key| !matches!(key.as_str(), "name" | "amount" | "quantity"))
            {
                self.reject(name, "An item takes only name, amount and quantity.");
                continue;
            }

            let item_name = fields.get("name").and_then(Value::as_str).map(str::trim);
            let amount = fields.get("amount").and_then(Value::as_str);

            // An unparseable quantity is an error, not something to drop:
            // a line item that silently lost its count is a wrong receipt.
            let quantity: std::result::Result<Option<Decimal>, ()> = match fields.get("quantity") {
                None | Some(Value::Null) => Ok(None),
                Some(Value::String(raw)) => Decimal::from_str(raw.trim()).map(Some).map_err(|_| ()),
                Some(_) => Err(()),
            };

            match (item_name, amount.map(|raw| Decimal::from_str(raw.trim())), quantity) {
                (Some(item_name), Some(Ok(amount)), Ok(quantity)) if !item_name.is_empty() => {
                    out.push(ItemArg {
                        name: item_name
                            .chars()
                            .filter(|c| !c.is_control())
                            .take(MAX_TEXT)
                            .collect(),
                        amount,
                        quantity,
                    })
                }
                _ => self.reject(
                    name,
                    "Every item needs a name and an amount, and both amount and quantity are strings.",
                ),
            }
        }

        out
    }

    /// The shared field set of `create_transaction` and
    /// `update_transaction`.
    fn transaction(&mut self, is_update: bool) -> WriteTransactionArgs {
        WriteTransactionArgs {
            transaction_id: is_update.then(|| self.id("transaction_id")).flatten(),
            kind: self.one_of("type", &["income", "expense", "transfer"]),
            amount: self.amount("amount"),
            to_amount: self.amount("to_amount"),
            wallet_id: self.id("wallet_id"),
            to_wallet_id: self.id("to_wallet_id"),
            category_id: self.id("category_id"),
            date: self.date("date"),
            name: self.text("name"),
            description: self.text("description"),
        }
    }

    /// An unknown key is refused rather than ignored.
    fn finish(mut self) -> Result<(), AppError> {
        let unknown: Vec<String> = self
            .fields
            .into_iter()
            .flat_map(|fields| fields.keys())
            .filter(|key| !self.seen.contains(&key.as_str()))
            .cloned()
            .collect();

        for key in unknown {
            self.errors
                .entry(key)
                .or_insert_with(|| "This tool does not take that argument.".to_string());
        }

        if self.errors.is_empty() {
            Ok(())
        } else {
            Err(AppError::ToolArgsInvalid(self.errors))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn parse(tool: Tool, args: Value) -> Result<ToolCall, AppError> {
        ToolCall::parse(tool, &args)
    }

    fn fields(error: AppError) -> FieldErrors {
        match error {
            AppError::ToolArgsInvalid(fields) => fields,
            other => panic!("expected TOOL_ARGS_INVALID, got {}", other.code()),
        }
    }

    /// SEC-26
    #[test]
    fn should_know_every_tool_by_name_and_nothing_else() {
        for tool in Tool::ALL {
            assert_eq!(Tool::parse(tool.name()).unwrap(), tool);
        }
        assert_eq!(
            Tool::ALL.len(),
            21,
            "the catalog is twenty-one tools (D17, D88, D103, D120)"
        );
        assert!(matches!(
            Tool::parse("delete_wallet"),
            Err(AppError::ToolNotFound)
        ));
        assert!(matches!(
            Tool::parse("bulk_delete_transactions"),
            Err(AppError::ToolNotFound)
        ));
    }

    #[test]
    fn should_let_a_member_read_but_never_write() {
        for tool in Tool::ALL {
            assert_eq!(
                tool.allowed_for(Role::Member),
                !tool.is_write(),
                "{} for a member",
                tool.name()
            );
            assert!(
                tool.allowed_for(Role::Admin),
                "{} for an admin",
                tool.name()
            );
            assert!(
                tool.allowed_for(Role::Owner),
                "{} for an owner",
                tool.name()
            );
        }
    }

    #[test]
    fn should_not_count_a_question_as_a_write() {
        assert!(!Tool::PresentChoices.is_write());
        assert!(!Tool::GetSpendingSummary.is_write());
        assert!(Tool::AddTransactionItems.is_write());
    }

    #[test]
    fn should_refuse_an_amount_that_arrived_as_a_number() {
        let error = parse(
            Tool::CreateTransaction,
            json!({ "type": "expense", "amount": 50000, "wallet_id": "wal_cash" }),
        )
        .unwrap_err();

        assert_eq!(
            fields(error)["amount"],
            "An amount is a string, never a number."
        );
    }

    #[test]
    fn should_accept_a_well_formed_create() {
        let call = parse(
            Tool::CreateTransaction,
            json!({
                "type": "expense",
                "amount": "50000.00",
                "wallet_id": "wal_cash",
                "category_id": "cat_food",
                "date": "2026-11-03",
                "name": "Lunch"
            }),
        )
        .unwrap();

        let ToolCall::CreateTransaction(args) = call else {
            panic!("wrong variant")
        };
        assert_eq!(args.amount, Some(Decimal::from_str("50000.00").unwrap()));
        assert_eq!(args.name.as_deref(), Some("Lunch"));
        assert_eq!(args.date.unwrap().to_rfc3339(), "2026-11-03T00:00:00+00:00");
    }

    #[test]
    fn should_report_every_missing_required_field_at_once() {
        let missing = fields(parse(Tool::CreateTransaction, json!({})).unwrap_err());

        assert!(missing.contains_key("type"));
        assert!(missing.contains_key("amount"));
        assert!(missing.contains_key("wallet_id"));
    }

    #[test]
    fn should_refuse_an_argument_the_tool_does_not_take() {
        let error = parse(
            Tool::CreateCategory,
            json!({ "name": "Food", "type": "expense", "workspace_id": "ws_other" }),
        )
        .unwrap_err();

        assert_eq!(
            fields(error)["workspace_id"],
            "This tool does not take that argument."
        );
    }

    #[test]
    fn should_refuse_a_type_outside_the_enum() {
        let error = parse(
            Tool::CreateCategory,
            json!({ "name": "Food", "type": "savings" }),
        )
        .unwrap_err();
        assert!(fields(error)["type"].starts_with("Expected one of"));
    }

    #[test]
    fn should_refuse_a_date_in_the_workspace_display_format() {
        let error =
            parse(Tool::GetRecentTransactions, json!({ "from": "03/11/2026" })).unwrap_err();
        assert!(fields(error)["from"].contains("ISO 8601"));
    }

    #[test]
    fn should_accept_a_full_timestamp_as_well_as_a_date() {
        let call = parse(
            Tool::GetRecentTransactions,
            json!({ "from": "2026-11-03T09:30:00Z" }),
        )
        .unwrap();
        let ToolCall::GetRecentTransactions(args) = call else {
            panic!("wrong variant")
        };
        assert_eq!(args.from.unwrap().to_rfc3339(), "2026-11-03T09:30:00+00:00");
    }

    #[test]
    fn should_bound_a_limit() {
        assert!(parse(Tool::GetRecentTransactions, json!({ "limit": 0 })).is_err());
        assert!(parse(Tool::GetRecentTransactions, json!({ "limit": 51 })).is_err());
        assert!(parse(Tool::GetRecentTransactions, json!({ "limit": 50 })).is_ok());
    }

    #[test]
    fn should_treat_null_as_absent() {
        let call = parse(
            Tool::GetRecentTransactions,
            json!({ "limit": null, "from": null, "to": null }),
        )
        .unwrap();
        assert_eq!(call, ToolCall::GetRecentTransactions(RecentArgs::default()));
    }

    #[test]
    fn should_accept_a_tool_that_takes_no_arguments() {
        assert_eq!(
            parse(Tool::GetWorkspaceContext, json!(null)).unwrap(),
            ToolCall::GetWorkspaceContext
        );
        assert_eq!(
            parse(Tool::GetWorkspaceContext, json!({})).unwrap(),
            ToolCall::GetWorkspaceContext
        );
    }

    #[test]
    fn should_refuse_arguments_that_are_not_an_object() {
        let error = parse(Tool::GetWorkspaceContext, json!("everything")).unwrap_err();
        assert_eq!(fields(error)["args"], "Arguments must be an object.");
    }

    #[test]
    fn should_require_a_range_for_a_summary_and_keep_it_in_order() {
        let error = parse(Tool::GetSpendingSummary, json!({ "group_by": "category" })).unwrap_err();
        let missing = fields(error);
        assert!(missing.contains_key("from") && missing.contains_key("to"));

        let error = parse(
            Tool::GetSpendingSummary,
            json!({ "from": "2026-11-30", "to": "2026-11-01", "group_by": "month" }),
        )
        .unwrap_err();
        assert!(fields(error)["from"].contains("after"));
    }

    #[test]
    fn should_require_an_ordered_range_for_every_analysis_tool() {
        for tool in [
            Tool::GetSpendingAnalysis,
            Tool::GetIncomeSummary,
            Tool::GetBurnRate,
        ] {
            assert!(!tool.is_write(), "{} is a read", tool.name());

            let missing = fields(parse(tool, json!({})).unwrap_err());
            assert!(missing.contains_key("from") && missing.contains_key("to"));

            let reversed = parse(tool, json!({ "from": "2026-11-30", "to": "2026-11-01" }));
            assert!(fields(reversed.unwrap_err())["from"].contains("after"));

            let call = parse(tool, json!({ "from": "2026-11-01", "to": "2026-11-30" })).unwrap();
            let args = match call {
                ToolCall::GetSpendingAnalysis(args)
                | ToolCall::GetIncomeSummary(args)
                | ToolCall::GetBurnRate(args) => args,
                other => panic!("wrong variant {other:?}"),
            };
            assert_eq!(args.from.date_naive().to_string(), "2026-11-01");
            assert_eq!(args.to.date_naive().to_string(), "2026-11-30");
        }
    }

    /// BUD-5
    #[test]
    fn should_read_an_optional_month_for_the_budget_tool() {
        assert!(!Tool::GetBudgetStatus.is_write());
        assert_eq!(
            parse(Tool::GetBudgetStatus, json!({})).unwrap(),
            ToolCall::GetBudgetStatus(None)
        );
        assert_eq!(
            parse(Tool::GetBudgetStatus, json!({ "month": "2026-10" })).unwrap(),
            ToolCall::GetBudgetStatus(Month::parse("2026-10"))
        );
        for bad in [json!({ "month": "2026-13" }), json!({ "month": 202610 })] {
            let error = parse(Tool::GetBudgetStatus, bad).unwrap_err();
            assert!(fields(error)["month"].contains("YYYY-MM"));
        }
    }

    #[test]
    fn should_read_every_grouping() {
        for grouping in ["category", "wallet", "type", "month"] {
            let call = parse(
                Tool::GetSpendingSummary,
                json!({ "from": "2026-11-01", "to": "2026-11-30", "group_by": grouping }),
            )
            .unwrap();
            let ToolCall::GetSpendingSummary(args) = call else {
                panic!("wrong variant")
            };
            assert_eq!(args.group_by.as_str(), grouping);
        }
    }

    #[test]
    fn should_not_honour_a_confirmed_flag_as_an_argument_problem() {
        // Parsing accepts it. Whether it means anything is the API's
        // decision, and that is the point of D20.
        let call = parse(
            Tool::DeleteTransaction,
            json!({ "transaction_id": "txn_1", "confirmed": true }),
        )
        .unwrap();
        assert_eq!(
            call,
            ToolCall::DeleteTransaction(DeleteArgs {
                transaction_id: "txn_1".into(),
                confirmed: true
            })
        );
    }

    #[test]
    fn should_read_line_items_with_string_amounts() {
        let call = parse(
            Tool::AddTransactionItems,
            json!({
                "transaction_id": "txn_1",
                "items": [{ "name": "Nasi goreng", "amount": "25000", "quantity": "2" }]
            }),
        )
        .unwrap();

        let ToolCall::AddTransactionItems(args) = call else {
            panic!("wrong variant")
        };
        assert_eq!(args.items.len(), 1);
        assert_eq!(args.items[0].amount, Decimal::from_str("25000").unwrap());
        assert_eq!(
            args.items[0].quantity,
            Some(Decimal::from_str("2").unwrap())
        );
    }

    #[test]
    fn should_refuse_a_line_item_whose_amount_is_a_number() {
        let error = parse(
            Tool::AddTransactionItems,
            json!({ "transaction_id": "txn_1", "items": [{ "name": "Nasi goreng", "amount": 25000 }] }),
        )
        .unwrap_err();
        assert!(fields(error)["items"].contains("strings"));
    }

    #[test]
    fn should_refuse_a_line_item_key_the_tool_does_not_take() {
        let error = parse(
            Tool::AddTransactionItems,
            json!({
                "transaction_id": "txn_1",
                "items": [{ "name": "Nasi goreng", "amount": "1", "category_id": "cat_food" }]
            }),
        )
        .unwrap_err();
        assert!(fields(error)["items"].contains("only name, amount and quantity"));
    }

    #[test]
    fn should_refuse_a_line_item_quantity_it_cannot_read() {
        let error = parse(
            Tool::AddTransactionItems,
            json!({
                "transaction_id": "txn_1",
                "items": [{ "name": "Nasi goreng", "amount": "1", "quantity": "two" }]
            }),
        )
        .unwrap_err();
        assert!(fields(error).contains_key("items"));
    }

    #[test]
    fn should_bound_a_list_of_items() {
        let items: Vec<Value> = (0..MAX_ITEMS + 1)
            .map(|index| json!({ "name": format!("item {index}"), "amount": "1" }))
            .collect();

        let error = parse(
            Tool::AddTransactionItems,
            json!({ "transaction_id": "txn_1", "items": items }),
        )
        .unwrap_err();
        assert!(fields(error)["items"].contains("At most"));
    }

    #[test]
    fn should_want_at_least_two_choices_to_choose_between() {
        let error = parse(
            Tool::PresentChoices,
            json!({ "question": "Which wallet?", "choices": ["Cash"] }),
        )
        .unwrap_err();
        assert!(fields(error).contains_key("choices"));

        assert!(parse(
            Tool::PresentChoices,
            json!({ "question": "Which wallet?", "choices": ["Cash", "Bank"] })
        )
        .is_ok());
    }

    #[test]
    fn should_strip_control_characters_from_text() {
        let call = parse(
            Tool::CreateCategory,
            json!({ "name": "  Fo\u{0000}od\n", "type": "expense" }),
        )
        .unwrap();
        let ToolCall::CreateCategory(args) = call else {
            panic!("wrong variant")
        };
        assert_eq!(args.name, "Food");
    }

    fn split(args: Value) -> SplitBillArgs {
        match parse(Tool::SplitBill, args).unwrap() {
            ToolCall::SplitBill(args) => args,
            other => panic!("wrong variant {other:?}"),
        }
    }

    /// DEBT-14
    #[test]
    fn should_count_the_debt_tools_against_the_turn() {
        assert!(!Tool::GetOutstandingDebts.is_write());
        for tool in [
            Tool::CreateDebt,
            Tool::PayDebt,
            Tool::UpdateDebt,
            Tool::DeleteDebt,
            Tool::SplitBill,
        ] {
            assert!(tool.is_write(), "{} is a write", tool.name());
            assert!(
                !tool.allowed_for(Role::Member),
                "{} for a member",
                tool.name()
            );
        }
        assert!(Tool::DeleteDebt.is_delete());
        assert!(Tool::PayDebt.creates_transaction());
        assert!(Tool::SplitBill.creates_transaction());
        assert!(!Tool::CreateDebt.creates_transaction());
        assert!(!Tool::UpdateDebt.creates_transaction());
    }

    /// DEBT-14, D122
    #[test]
    fn should_confirm_the_deletes_and_the_split_and_nothing_else() {
        let confirmed: Vec<&str> = Tool::ALL
            .into_iter()
            .filter(|tool| tool.needs_confirmation())
            .map(Tool::name)
            .collect();
        assert_eq!(
            confirmed,
            ["delete_transaction", "delete_debt", "split_bill"]
        );
    }

    /// DEBT-14
    #[test]
    fn should_take_no_arguments_for_outstanding_debts() {
        assert_eq!(
            parse(Tool::GetOutstandingDebts, json!({})).unwrap(),
            ToolCall::GetOutstandingDebts
        );
        let error = parse(Tool::GetOutstandingDebts, json!({ "contact": "Budi" })).unwrap_err();
        assert!(fields(error).contains_key("contact"));
    }

    /// DEBT-14
    #[test]
    fn should_read_a_debt_with_a_due_date_and_a_string_amount() {
        let call = parse(
            Tool::CreateDebt,
            json!({
                "type": "receivable",
                "contact_name": " Budi ",
                "amount": "50000",
                "due_date": "2026-12-01"
            }),
        )
        .unwrap();
        let ToolCall::CreateDebt(args) = call else {
            panic!("wrong variant")
        };
        assert_eq!(args.contact_name, "Budi");
        assert_eq!(args.amount, Decimal::from_str("50000").unwrap());
        assert_eq!(args.due_date.unwrap().to_string(), "2026-12-01");
        assert_eq!(args.currency_code, None);
    }

    /// DEBT-14
    #[test]
    fn should_refuse_a_debt_without_what_it_needs() {
        let missing = fields(parse(Tool::CreateDebt, json!({})).unwrap_err());
        for key in ["type", "contact_name", "amount"] {
            assert!(missing.contains_key(key), "{key}");
        }

        let error = parse(
            Tool::CreateDebt,
            json!({ "type": "loan", "contact_name": "Budi", "amount": "1" }),
        )
        .unwrap_err();
        assert!(fields(error)["type"].starts_with("Expected one of"));

        let error = parse(
            Tool::PayDebt,
            json!({ "debt_id": "debt_1", "amount": 20000 }),
        )
        .unwrap_err();
        assert_eq!(
            fields(error)["amount"],
            "An amount is a string, never a number."
        );
    }

    /// DEBT-14
    #[test]
    fn should_refuse_a_debt_argument_the_tool_does_not_take() {
        let error = parse(
            Tool::UpdateDebt,
            json!({ "debt_id": "debt_1", "type": "payable" }),
        )
        .unwrap_err();
        assert_eq!(
            fields(error)["type"],
            "This tool does not take that argument."
        );

        let error = parse(
            Tool::PayDebt,
            json!({ "debt_id": "debt_1", "amount": "1", "date": "2026-11-01" }),
        )
        .unwrap_err();
        assert!(fields(error).contains_key("date"));
    }

    /// DEBT-14
    #[test]
    fn should_key_a_debt_challenge_apart_from_a_transaction_challenge() {
        let delete_debt = parse(Tool::DeleteDebt, json!({ "debt_id": "abc" })).unwrap();
        let delete_transaction =
            parse(Tool::DeleteTransaction, json!({ "transaction_id": "abc" })).unwrap();

        assert_eq!(delete_debt.confirmation(), Some(("debt:abc".into(), false)));
        assert_eq!(
            delete_transaction.confirmation(),
            Some(("abc".into(), false))
        );
        assert_eq!(
            parse(Tool::GetOutstandingDebts, json!({}))
                .unwrap()
                .confirmation(),
            None
        );
    }

    /// D122
    #[test]
    fn should_bound_a_split_to_one_to_twenty_people() {
        let error = parse(
            Tool::SplitBill,
            json!({ "amount": "300000", "name": "Dinner", "contact_names": [] }),
        )
        .unwrap_err();
        assert!(fields(error).contains_key("contact_names"));

        let too_many: Vec<String> = (0..=MAX_SPLIT_CONTACTS)
            .map(|index| format!("Friend {index}"))
            .collect();
        let error = parse(
            Tool::SplitBill,
            json!({ "amount": "300000", "name": "Dinner", "contact_names": too_many }),
        )
        .unwrap_err();
        assert!(fields(error)["contact_names"].contains("At most"));
    }

    /// D122
    #[test]
    fn should_key_a_split_by_what_it_would_write() {
        let base = split(json!({
            "amount": "300000",
            "name": "Dinner",
            "wallet_id": "wal_bca",
            "contact_names": ["Ani", "Budi"]
        }));

        // The same split, said differently, answers the same challenge.
        let reordered = split(json!({
            "contact_names": ["budi", "ANI"],
            "wallet_id": "wal_bca",
            "name": "Dinner",
            "amount": "300000.00",
            "confirmed": true
        }));
        assert_eq!(base.challenge_key(), reordered.challenge_key());
        assert!(base.challenge_key().starts_with("split:"));

        // Any change to who or how much is a different split.
        for other in [
            json!({ "amount": "300001", "name": "Dinner", "wallet_id": "wal_bca", "contact_names": ["Ani", "Budi"] }),
            json!({ "amount": "300000", "name": "Dinner", "wallet_id": "wal_bca", "contact_names": ["Ani", "Budi", "Citra"] }),
            json!({ "amount": "300000", "name": "Dinner", "wallet_id": "wal_cash", "contact_names": ["Ani", "Budi"] }),
            json!({ "amount": "300000", "name": "Lunch", "wallet_id": "wal_bca", "contact_names": ["Ani", "Budi"] }),
            json!({ "amount": "300000", "name": "Dinner", "contact_names": ["Ani", "Budi"] }),
        ] {
            assert_ne!(base.challenge_key(), split(other).challenge_key());
        }

        // A name boundary cannot be moved without changing the key.
        let joined = split(json!({ "amount": "1", "name": "ab", "contact_names": ["c"] }));
        let moved = split(json!({ "amount": "1", "name": "a", "contact_names": ["bc"] }));
        assert_ne!(joined.challenge_key(), moved.challenge_key());

        let call = ToolCall::SplitBill(reordered.clone());
        assert_eq!(call.confirmation(), Some((reordered.challenge_key(), true)));
    }
}
