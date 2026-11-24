//! The one error type, and the one place it is mapped to the wire.
//!
//! Every variant maps to exactly one stable code and one HTTP status. The
//! catalog is docs/api/conventions.md#error-catalog; this enum is the
//! executable copy of it, and a test asserts the two have not drifted.

use std::collections::BTreeMap;

use serde::Serialize;

/// Per-field validation messages, keyed by field name.
pub type FieldErrors = BTreeMap<String, String>;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    // -- auth and tenancy
    #[error("authentication required")]
    Unauthenticated,
    #[error("invalid credentials")]
    InvalidCredentials,
    #[error("insufficient role")]
    InsufficientRole,
    #[error("email already registered")]
    EmailTaken,
    #[error("not a member of that workspace")]
    NotAMember,
    /// A session that belongs to no workspace yet, used on a route that
    /// reads or writes one (D109).
    #[error("no workspace selected")]
    NoWorkspace,
    #[error("cannot remove the last owner")]
    LastOwner,
    #[error("invite is invalid")]
    InviteInvalid,
    #[error("password reset token is invalid")]
    ResetTokenInvalid,
    #[error("mcp token is invalid")]
    McpTokenInvalid,
    /// A body or query named a workspace. It comes from the token (AUTH-4).
    #[error("workspace_id is taken from the token, never from the request")]
    WorkspaceIdNotAllowed,

    // -- validation and general
    #[error("validation failed")]
    Validation(FieldErrors),
    #[error("malformed request")]
    MalformedRequest,
    #[error("not found")]
    NotFound,
    #[error("rate limited")]
    RateLimited { retry_after_secs: u64 },

    // -- wallets and categories
    #[error("wallet not found")]
    WalletNotFound,
    #[error("wallet has transactions")]
    WalletHasTransactions,
    #[error("category not found")]
    CategoryNotFound,
    #[error("wallet currency is locked")]
    WalletCurrencyLocked,
    #[error("workspace currency is locked")]
    WorkspaceCurrencyLocked,
    #[error("workspace currency changed during the write")]
    WorkspaceCurrencyChanged,

    // -- transactions
    #[error("transaction not found")]
    TransactionNotFound,
    #[error("transfer requires a destination wallet")]
    TransferRequiresDestination,
    #[error("transfer source and destination are the same wallet")]
    TransferSameWallet,
    #[error("destination wallet is not allowed for this type")]
    DestinationNotAllowed,
    #[error("transfer requires a destination amount")]
    TransferAmountRequired,
    #[error("amount must be greater than zero")]
    AmountNotPositive,
    /// A create's client `id` names a row the caller cannot have: another
    /// workspace's, or another kind's. Never says which (D114).
    #[error("id already taken")]
    IdTaken,
    /// `If-Match` no longer matches, or the row is deleted. Carries the row
    /// as it is now, or `None` when it is deleted (D115).
    #[error("row changed since it was read")]
    Stale(Option<serde_json::Value>),
    #[error("import job not found")]
    ImportJobNotFound,
    #[error("no exchange rate could be resolved")]
    FxRateUnavailable,

    // -- debts and contacts (D120, D121)
    #[error("contact not found")]
    ContactNotFound,
    #[error("contact has debts")]
    ContactHasDebts,
    #[error("a contact cannot be merged into itself")]
    ContactMergeSelf,
    #[error("debt not found")]
    DebtNotFound,
    #[error("payment not found")]
    PaymentNotFound,
    #[error("debt has payments")]
    DebtHasPayments,
    #[error("amount is below what is already paid")]
    AmountBelowPaid,
    #[error("payment exceeds the remaining amount")]
    PaymentExceedsRemaining,
    #[error("every debt must be in the wallet's currency")]
    BulkPayCurrencyMismatch,
    #[error("split source is not an expense")]
    SplitSourceNotExpense,
    #[error("this transaction is a debt payment")]
    PaymentTransactionLocked,

    // -- files
    #[error("file too large")]
    FileTooLarge,
    #[error("unsupported file type")]
    UnsupportedFileType,
    #[error("file not found")]
    FileNotFound,
    /// The file is there, but no preview can be made from it (D91).
    #[error("thumbnail unavailable")]
    ThumbnailUnavailable,
    /// Not an `.xlsx`, or one calamine cannot read (D111).
    #[error("spreadsheet unreadable")]
    SpreadsheetUnreadable,
    /// Over a bound of the spreadsheet import: bytes, unpacked size, rows or
    /// columns (D111).
    #[error("spreadsheet too large")]
    SpreadsheetTooLarge,

    // -- transport (OWE1). Answered in plaintext; the caller may hold no key.
    #[error("crypto session unknown")]
    CryptoSessionUnknown,
    #[error("decryption failed")]
    CryptoDecryptFailed,
    #[error("replay detected")]
    CryptoReplayDetected,
    #[error("clock skew")]
    CryptoClockSkew { server_time: i64 },
    #[error("query string is not encrypted")]
    CryptoQueryNotEncrypted,
    #[error("unsupported protocol version")]
    CryptoVersionUnsupported,

    // -- chat and AI
    #[error("chat session not found")]
    SessionNotFound,
    #[error("ai service unavailable")]
    AiUnavailable,
    #[error("receipt unreadable")]
    ReceiptUnreadable,
    #[error("statement unreadable")]
    StatementUnreadable,
    /// Every extraction pass timed out or failed, so nothing read the
    /// document. Not unreadable: the photo may be fine, and the user is
    /// told to try again rather than to take another one.
    #[error("extraction got no answer")]
    ExtractionNoAnswer,
    #[error("tool not found")]
    ToolNotFound,
    #[error("tool arguments invalid")]
    ToolArgsInvalid(FieldErrors),
    #[error("tool forbidden for this role")]
    ToolForbidden,
    /// Carries a description of the row the caller asked to destroy: date,
    /// name, amount, wallet. The assistant quotes it back to the user and
    /// asks, which is the whole point of the challenge (CHAT-6, D20).
    #[error("confirmation required")]
    ConfirmationRequired(FieldErrors),
    #[error("tool cap exceeded for this turn")]
    ToolCapExceeded,

    // -- integrations
    /// The server runs without a Telegram bot configured (D84).
    #[error("telegram is not configured")]
    TelegramDisabled,

    /// The only variant that carries a source. The source is logged; the
    /// client gets the code and the request id and nothing else.
    #[error("internal error")]
    Internal(#[source] anyhow::Error),
}

impl AppError {
    /// The stable wire code. Never reused for a different meaning.
    pub fn code(&self) -> &'static str {
        use AppError::*;
        match self {
            Unauthenticated => "UNAUTHENTICATED",
            InvalidCredentials => "INVALID_CREDENTIALS",
            InsufficientRole => "INSUFFICIENT_ROLE",
            EmailTaken => "EMAIL_TAKEN",
            NotAMember => "NOT_A_MEMBER",
            NoWorkspace => "NO_WORKSPACE",
            LastOwner => "LAST_OWNER",
            InviteInvalid => "INVITE_INVALID",
            McpTokenInvalid => "MCP_TOKEN_INVALID",
            WorkspaceIdNotAllowed => "WORKSPACE_ID_NOT_ALLOWED",
            ResetTokenInvalid => "RESET_TOKEN_INVALID",
            Validation(_) => "VALIDATION_FAILED",
            MalformedRequest => "MALFORMED_REQUEST",
            NotFound => "NOT_FOUND",
            RateLimited { .. } => "RATE_LIMITED",
            WalletNotFound => "WALLET_NOT_FOUND",
            WalletHasTransactions => "WALLET_HAS_TRANSACTIONS",
            CategoryNotFound => "CATEGORY_NOT_FOUND",
            WalletCurrencyLocked => "WALLET_CURRENCY_LOCKED",
            WorkspaceCurrencyLocked => "WORKSPACE_CURRENCY_LOCKED",
            WorkspaceCurrencyChanged => "WORKSPACE_CURRENCY_CHANGED",
            TransactionNotFound => "TRANSACTION_NOT_FOUND",
            TransferRequiresDestination => "TRANSFER_REQUIRES_DESTINATION",
            TransferSameWallet => "TRANSFER_SAME_WALLET",
            DestinationNotAllowed => "DESTINATION_NOT_ALLOWED",
            TransferAmountRequired => "TRANSFER_AMOUNT_REQUIRED",
            AmountNotPositive => "AMOUNT_NOT_POSITIVE",
            IdTaken => "ID_TAKEN",
            Stale(_) => "STALE",
            ImportJobNotFound => "IMPORT_JOB_NOT_FOUND",
            FxRateUnavailable => "FX_RATE_UNAVAILABLE",
            ContactNotFound => "CONTACT_NOT_FOUND",
            ContactHasDebts => "CONTACT_HAS_DEBTS",
            ContactMergeSelf => "CONTACT_MERGE_SELF",
            DebtNotFound => "DEBT_NOT_FOUND",
            PaymentNotFound => "PAYMENT_NOT_FOUND",
            DebtHasPayments => "DEBT_HAS_PAYMENTS",
            AmountBelowPaid => "AMOUNT_BELOW_PAID",
            PaymentExceedsRemaining => "PAYMENT_EXCEEDS_REMAINING",
            BulkPayCurrencyMismatch => "BULK_PAY_CURRENCY_MISMATCH",
            SplitSourceNotExpense => "SPLIT_SOURCE_NOT_EXPENSE",
            PaymentTransactionLocked => "PAYMENT_TRANSACTION_LOCKED",
            FileTooLarge => "FILE_TOO_LARGE",
            UnsupportedFileType => "UNSUPPORTED_FILE_TYPE",
            FileNotFound => "FILE_NOT_FOUND",
            ThumbnailUnavailable => "THUMBNAIL_UNAVAILABLE",
            SpreadsheetUnreadable => "SPREADSHEET_UNREADABLE",
            SpreadsheetTooLarge => "SPREADSHEET_TOO_LARGE",
            CryptoSessionUnknown => "CRYPTO_SESSION_UNKNOWN",
            CryptoDecryptFailed => "CRYPTO_DECRYPT_FAILED",
            CryptoReplayDetected => "CRYPTO_REPLAY_DETECTED",
            CryptoClockSkew { .. } => "CRYPTO_CLOCK_SKEW",
            CryptoQueryNotEncrypted => "CRYPTO_QUERY_NOT_ENCRYPTED",
            CryptoVersionUnsupported => "CRYPTO_VERSION_UNSUPPORTED",
            SessionNotFound => "SESSION_NOT_FOUND",
            AiUnavailable => "AI_UNAVAILABLE",
            ReceiptUnreadable => "RECEIPT_UNREADABLE",
            TelegramDisabled => "TELEGRAM_DISABLED",
            StatementUnreadable => "STATEMENT_UNREADABLE",
            ExtractionNoAnswer => "EXTRACTION_NO_ANSWER",
            ToolNotFound => "TOOL_NOT_FOUND",
            ToolArgsInvalid(_) => "TOOL_ARGS_INVALID",
            ToolForbidden => "TOOL_FORBIDDEN",
            ConfirmationRequired(_) => "CONFIRMATION_REQUIRED",
            ToolCapExceeded => "TOOL_CAP_EXCEEDED",
            Internal(_) => "INTERNAL_ERROR",
        }
    }

    /// The HTTP status, as a plain u16 so `domain` stays free of Axum.
    pub fn status(&self) -> u16 {
        use AppError::*;
        match self {
            Unauthenticated | InvalidCredentials | CryptoSessionUnknown | McpTokenInvalid => 401,
            InsufficientRole | NotAMember | NoWorkspace | ToolForbidden => 403,
            EmailTaken
            | LastOwner
            | WalletHasTransactions
            | WalletCurrencyLocked
            | WorkspaceCurrencyLocked
            | WorkspaceCurrencyChanged
            | ConfirmationRequired(_)
            | ToolCapExceeded
            | IdTaken
            | Stale(_)
            | ContactHasDebts
            | DebtHasPayments
            | PaymentTransactionLocked => 409,
            InviteInvalid | ResetTokenInvalid | NotFound | WalletNotFound | CategoryNotFound
            | TransactionNotFound | ImportJobNotFound | FileNotFound | ThumbnailUnavailable
            | SessionNotFound | ContactNotFound | DebtNotFound | PaymentNotFound => 404,
            Validation(_)
            | TransferRequiresDestination
            | TransferSameWallet
            | DestinationNotAllowed
            | TransferAmountRequired
            | AmountNotPositive
            | ReceiptUnreadable
            | StatementUnreadable
            | SpreadsheetUnreadable
            | ToolArgsInvalid(_)
            | ContactMergeSelf
            | AmountBelowPaid
            | PaymentExceedsRemaining
            | BulkPayCurrencyMismatch
            | SplitSourceNotExpense => 422,
            MalformedRequest
            | WorkspaceIdNotAllowed
            | CryptoDecryptFailed
            | CryptoReplayDetected
            | CryptoClockSkew { .. }
            | CryptoQueryNotEncrypted
            | CryptoVersionUnsupported
            | ToolNotFound => 400,
            RateLimited { .. } => 429,
            FileTooLarge | SpreadsheetTooLarge => 413,
            UnsupportedFileType => 415,
            FxRateUnavailable | AiUnavailable | ExtractionNoAnswer | TelegramDisabled => 503,
            Internal(_) => 500,
        }
    }

    /// How to fix it. For developers, logs and agents; the web app renders a
    /// dictionary string keyed by `code` instead (UI-1).
    pub fn hint(&self) -> Option<&'static str> {
        use AppError::*;
        Some(match self {
            Unauthenticated => "Sign in and try again.",
            InvalidCredentials => "Check the email address and password.",
            InsufficientRole => "This action needs the owner or admin role.",
            EmailTaken => "Sign in instead, or use another address.",
            LastOwner => "Promote another member to owner first.",
            NoWorkspace => "Create a workspace or accept an invitation, then switch into it.",
            McpTokenInvalid => "Create a new token in Account, MCP, or connect again.",
            WorkspaceIdNotAllowed => "Drop workspace_id; switch workspace to act in another one.",
            Validation(_) | ToolArgsInvalid(_) => "Fix the listed fields and try again.",
            WalletNotFound => "Reload your wallets and pick one that still exists.",
            WalletHasTransactions => "Move or delete its transactions first.",
            WalletCurrencyLocked | WorkspaceCurrencyLocked => {
                "The currency is fixed once transactions exist."
            }
            WorkspaceCurrencyChanged => {
                "The workspace currency was converted while this was saved. Try again."
            }
            TransferRequiresDestination | TransferAmountRequired => {
                "A transfer needs a destination wallet and a destination amount."
            }
            TransferSameWallet => "Pick a different destination wallet.",
            IdTaken => "Create it again with a new id, or without one.",
            Stale(_) => {
                "Compare with details.current, then discard the change or send it again without If-Match."
            }
            FxRateUnavailable => "Enter the exchange rate by hand.",
            ContactHasDebts => "Delete its debts, or merge it into another contact.",
            DebtHasPayments => "Cancel its payments first.",
            AmountBelowPaid => "Enter at least the amount already paid.",
            PaymentExceedsRemaining => "Pay at most the remaining amount.",
            BulkPayCurrencyMismatch => "Pay debts in another currency separately.",
            PaymentTransactionLocked => "Change the payment from its debt instead.",
            FileTooLarge => "The limit is 10 MB.",
            UnsupportedFileType => "Accepted: JPEG, PNG, WebP and PDF.",
            SpreadsheetUnreadable => "Save it as .xlsx again, or export it as CSV.",
            SpreadsheetTooLarge => {
                "Up to 512 KB, 5,000 rows and 100 columns. Split the file, or export it as CSV."
            }
            CryptoSessionUnknown => "Run the handshake again and retry once.",
            CryptoClockSkew { .. } => "Correct the clock offset and retry once.",
            ConfirmationRequired(_) => "Ask the user to confirm, then call again.",
            ToolCapExceeded => {
                "One turn may not do this much. Tell the user what was done and stop."
            }
            ReceiptUnreadable | StatementUnreadable => {
                "Try a sharper photograph, or enter it manually."
            }
            ExtractionNoAnswer => "The document was not read. Try again in a moment.",
            RateLimited { .. } => "Wait and try again.",
            _ => return None,
        })
    }

    /// Per-field detail, when the variant carries any.
    pub fn fields(&self) -> Option<&FieldErrors> {
        match self {
            AppError::Validation(f)
            | AppError::ToolArgsInvalid(f)
            | AppError::ConfirmationRequired(f) => Some(f),
            _ => None,
        }
    }

    /// Transport errors answer in plaintext even when OWE1 is on, because the
    /// caller may have no working key (docs/api/encryption.md#errors).
    pub fn is_transport(&self) -> bool {
        self.code().starts_with("CRYPTO_")
    }

    pub fn validation(pairs: impl IntoIterator<Item = (&'static str, &'static str)>) -> Self {
        AppError::Validation(
            pairs
                .into_iter()
                .map(|(k, v)| (k.to_string(), v.to_string()))
                .collect(),
        )
    }
}

impl From<anyhow::Error> for AppError {
    fn from(err: anyhow::Error) -> Self {
        AppError::Internal(err)
    }
}

/// The serialized error object. `message` and `hint` are never rendered to a
/// user by the web app; it maps `code` to a dictionary key.
#[derive(Debug, Serialize)]
pub struct ErrorBody {
    pub code: &'static str,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hint: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<FieldErrors>,
    /// Structured detail beyond `fields`. Only `STALE` carries any (D115).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<serde_json::Value>,
    pub request_id: String,
}

impl AppError {
    pub fn to_body(&self, request_id: impl Into<String>) -> ErrorBody {
        ErrorBody {
            code: self.code(),
            // Internal keeps its source out of the response. It is logged
            // against the request id instead.
            message: match self {
                AppError::Internal(_) => "An unexpected error occurred.".to_string(),
                other => other.to_string(),
            },
            hint: self.hint(),
            fields: self.fields().cloned(),
            details: match self {
                AppError::Stale(current) => Some(serde_json::json!({ "current": current })),
                _ => None,
            },
            request_id: request_id.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Every variant this test can name must have a code and a status. The
    /// catalog in docs/api/conventions.md is the specification; this keeps the
    /// enum honest about the two columns that matter.
    /// OPS-4
    #[test]
    fn should_map_every_variant_to_a_code_and_a_status() {
        let samples = [
            AppError::Unauthenticated,
            AppError::InvalidCredentials,
            AppError::InsufficientRole,
            AppError::EmailTaken,
            AppError::NotAMember,
            AppError::NoWorkspace,
            AppError::LastOwner,
            AppError::InviteInvalid,
            AppError::ResetTokenInvalid,
            AppError::McpTokenInvalid,
            AppError::WorkspaceIdNotAllowed,
            AppError::Validation(FieldErrors::new()),
            AppError::MalformedRequest,
            AppError::NotFound,
            AppError::RateLimited {
                retry_after_secs: 1,
            },
            AppError::WalletNotFound,
            AppError::WalletHasTransactions,
            AppError::CategoryNotFound,
            AppError::WalletCurrencyLocked,
            AppError::WorkspaceCurrencyLocked,
            AppError::WorkspaceCurrencyChanged,
            AppError::TransactionNotFound,
            AppError::TransferRequiresDestination,
            AppError::TransferSameWallet,
            AppError::DestinationNotAllowed,
            AppError::TransferAmountRequired,
            AppError::AmountNotPositive,
            AppError::IdTaken,
            AppError::Stale(None),
            AppError::ImportJobNotFound,
            AppError::FxRateUnavailable,
            AppError::FileTooLarge,
            AppError::UnsupportedFileType,
            AppError::FileNotFound,
            AppError::ThumbnailUnavailable,
            AppError::SpreadsheetUnreadable,
            AppError::SpreadsheetTooLarge,
            AppError::CryptoSessionUnknown,
            AppError::CryptoDecryptFailed,
            AppError::CryptoReplayDetected,
            AppError::CryptoClockSkew { server_time: 0 },
            AppError::CryptoQueryNotEncrypted,
            AppError::CryptoVersionUnsupported,
            AppError::SessionNotFound,
            AppError::AiUnavailable,
            AppError::ReceiptUnreadable,
            AppError::StatementUnreadable,
            AppError::ExtractionNoAnswer,
            AppError::ToolNotFound,
            AppError::ToolArgsInvalid(FieldErrors::new()),
            AppError::ToolForbidden,
            AppError::ConfirmationRequired(FieldErrors::new()),
            AppError::ToolCapExceeded,
            AppError::TelegramDisabled,
            AppError::ContactNotFound,
            AppError::ContactHasDebts,
            AppError::ContactMergeSelf,
            AppError::DebtNotFound,
            AppError::PaymentNotFound,
            AppError::DebtHasPayments,
            AppError::AmountBelowPaid,
            AppError::PaymentExceedsRemaining,
            AppError::BulkPayCurrencyMismatch,
            AppError::SplitSourceNotExpense,
            AppError::PaymentTransactionLocked,
            AppError::Internal(anyhow::anyhow!("boom")),
        ];

        // Every catalog entry but TRANSPORT_UNEXPECTED_RESPONSE, a
        // client-side condition with no server variant by design.
        assert_eq!(samples.len(), 66);

        let mut seen = std::collections::HashSet::new();
        for error in &samples {
            assert!(
                seen.insert(error.code()),
                "duplicate code: {}",
                error.code()
            );
            assert!((400..=599).contains(&error.status()), "{}", error.code());
        }
    }

    #[test]
    fn should_not_leak_the_source_when_internal() {
        let error = AppError::Internal(anyhow::anyhow!("connection string: postgres://secret"));
        let body = error.to_body("req-1");
        assert_eq!(body.code, "INTERNAL_ERROR");
        assert!(!body.message.contains("secret"));
        assert!(body.fields.is_none());
    }

    /// MOB-7: the current row travels in `details.current`, null when deleted.
    #[test]
    fn should_carry_the_current_row_in_details_when_stale() {
        let body = AppError::Stale(None).to_body("req-1");
        assert_eq!(body.details, Some(serde_json::json!({ "current": null })));

        let body = AppError::Stale(Some(serde_json::json!({ "id": "a" }))).to_body("req-1");
        assert_eq!(body.details.unwrap()["current"]["id"], "a");
        assert!(AppError::IdTaken.to_body("req-1").details.is_none());
    }

    #[test]
    fn should_mark_only_crypto_variants_as_transport() {
        assert!(AppError::CryptoDecryptFailed.is_transport());
        assert!(!AppError::NotFound.is_transport());
    }
}
