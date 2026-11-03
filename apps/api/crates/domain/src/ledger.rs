//! Balance arithmetic, transaction validation and the import fingerprint.
//!
//! Pure: no database, no Axum, no clock. That is what lets every rule below
//! be tested without a server, which matters more here than anywhere else in
//! the product, because a wrong sign looks exactly like a right one.
//!
//! See docs/data-model.md#balance-arithmetic and #multicurrency.

use std::{fmt, str::FromStr};

use rust_decimal::{Decimal, RoundingStrategy};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::AppError;

/// Money is stored and compared at four decimal places, everywhere.
pub const MONEY_SCALE: u32 = 4;
/// A rate carries eight, because a weak currency against a strong one needs
/// them: 1 IDR is 0.00006 USD.
pub const RATE_SCALE: u32 = 8;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TransactionType {
    Income,
    Expense,
    Transfer,
}

impl TransactionType {
    pub fn as_str(&self) -> &'static str {
        match self {
            TransactionType::Income => "income",
            TransactionType::Expense => "expense",
            TransactionType::Transfer => "transfer",
        }
    }
}

impl fmt::Display for TransactionType {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, thiserror::Error)]
#[error("unknown transaction type: {0}")]
pub struct UnknownType(String);

impl FromStr for TransactionType {
    type Err = UnknownType;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "income" => Ok(TransactionType::Income),
            "expense" => Ok(TransactionType::Expense),
            "transfer" => Ok(TransactionType::Transfer),
            other => Err(UnknownType(other.to_string())),
        }
    }
}

/// Where a rate came from, which the UI shows when it is not `Same`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RateSource {
    /// Wallet currency equals the workspace currency. Nothing was looked up.
    Same,
    /// The rate the user saw and confirmed in the form.
    User,
    /// Fetched from the rate source for the transaction's date.
    Live,
    /// The live source did not answer; the newest cached rate was used, and
    /// `base_rate_date` records how old it is.
    Cache,
}

impl RateSource {
    /// Was this rate a fallback to an older day?
    ///
    /// Only the cache step can be stale: the other three are either exact
    /// or were chosen by the user. A row written on a stale rate is marked
    /// in the list and the detail sheet, naming the rate and its date
    /// (TXN-22).
    pub fn is_stale(&self, used: chrono::NaiveDate, wanted: chrono::NaiveDate) -> bool {
        *self == RateSource::Cache && used != wanted
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            RateSource::Same => "same",
            RateSource::User => "user",
            RateSource::Live => "live",
            RateSource::Cache => "cache",
        }
    }
}

impl FromStr for RateSource {
    type Err = UnknownType;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "same" => Ok(RateSource::Same),
            "user" => Ok(RateSource::User),
            "live" => Ok(RateSource::Live),
            "cache" => Ok(RateSource::Cache),
            other => Err(UnknownType(other.to_string())),
        }
    }
}

/// The money shape of one transaction, after parsing and before any write.
///
/// A value of this type is valid: `validate` is the only way to build one,
/// so a service cannot forget to call it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransactionShape {
    pub kind: TransactionType,
    pub wallet_id: String,
    pub to_wallet_id: Option<String>,
    pub amount: Decimal,
    pub to_amount: Option<Decimal>,
}

/// What the client sent, before validation.
#[derive(Debug, Clone)]
pub struct ProposedShape<'a> {
    pub kind: TransactionType,
    pub wallet_id: &'a str,
    pub to_wallet_id: Option<&'a str>,
    pub amount: Decimal,
    pub to_amount: Option<Decimal>,
}

impl TransactionShape {
    /// Every rule in docs/features/transactions.md#validation that does not
    /// need a database.
    ///
    /// Each failure has its own code: the form highlights a different field
    /// for a missing destination than for a missing destination amount.
    pub fn validate(proposed: ProposedShape<'_>) -> Result<Self, AppError> {
        if proposed.amount <= Decimal::ZERO {
            return Err(AppError::AmountNotPositive);
        }

        let (to_wallet_id, to_amount) = match proposed.kind {
            TransactionType::Transfer => {
                let destination = proposed
                    .to_wallet_id
                    .filter(|id| !id.is_empty())
                    .ok_or(AppError::TransferRequiresDestination)?;

                if destination == proposed.wallet_id {
                    return Err(AppError::TransferSameWallet);
                }

                let to_amount = proposed.to_amount.ok_or(AppError::TransferAmountRequired)?;
                if to_amount <= Decimal::ZERO {
                    return Err(AppError::TransferAmountRequired);
                }

                (Some(destination.to_string()), Some(round_money(to_amount)))
            }
            TransactionType::Income | TransactionType::Expense => {
                // Set on a non-transfer is a different mistake from missing on
                // a transfer, so it is a different code.
                if proposed.to_wallet_id.is_some_and(|id| !id.is_empty()) {
                    return Err(AppError::DestinationNotAllowed);
                }
                if proposed.to_amount.is_some() {
                    return Err(AppError::TransferAmountRequired);
                }
                (None, None)
            }
        };

        Ok(TransactionShape {
            kind: proposed.kind,
            wallet_id: proposed.wallet_id.to_string(),
            to_wallet_id,
            amount: round_money(proposed.amount),
            to_amount,
        })
    }

    /// What this transaction does to wallet balances (TXN-3).
    ///
    /// Returns one entry per affected wallet. Applying the negation of this
    /// is exactly how an update and a delete reverse themselves, which is
    /// why reversal is not a second set of rules.
    pub fn effect(&self) -> Vec<BalanceDelta> {
        match self.kind {
            TransactionType::Expense => vec![BalanceDelta {
                wallet_id: self.wallet_id.clone(),
                delta: -self.amount,
            }],
            TransactionType::Income => vec![BalanceDelta {
                wallet_id: self.wallet_id.clone(),
                delta: self.amount,
            }],
            TransactionType::Transfer => vec![
                BalanceDelta {
                    wallet_id: self.wallet_id.clone(),
                    delta: -self.amount,
                },
                BalanceDelta {
                    // `validate` refuses a transfer without a destination, so
                    // this cannot be None.
                    wallet_id: self.to_wallet_id.clone().unwrap_or_default(),
                    delta: self.to_amount.unwrap_or_default(),
                },
            ],
        }
    }
}

/// One wallet's balance movement.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BalanceDelta {
    pub wallet_id: String,
    pub delta: Decimal,
}

/// Reverse an effect: what a delete applies, and the first half of an update.
pub fn reverse(effects: &[BalanceDelta]) -> Vec<BalanceDelta> {
    effects
        .iter()
        .map(|effect| BalanceDelta {
            wallet_id: effect.wallet_id.clone(),
            delta: -effect.delta,
        })
        .collect()
}

/// Collapse several movements into one per wallet.
///
/// An update that keeps the same wallet produces a reversal and an
/// application against it; netting them means one `UPDATE` per wallet
/// instead of two, and the intermediate balance never exists.
pub fn net(effects: impl IntoIterator<Item = BalanceDelta>) -> Vec<BalanceDelta> {
    let mut netted: Vec<BalanceDelta> = Vec::new();

    for effect in effects {
        match netted
            .iter_mut()
            .find(|held| held.wallet_id == effect.wallet_id)
        {
            Some(held) => held.delta += effect.delta,
            None => netted.push(effect),
        }
    }

    // Ascending wallet ID, which is the lock order two concurrent transfers
    // in opposite directions need to avoid deadlocking (D13, TXN-6).
    netted.sort_by(|a, b| a.wallet_id.cmp(&b.wallet_id));
    netted.retain(|effect| effect.delta != Decimal::ZERO);
    netted
}

/// What the user typed, when its currency differed from the wallet's.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ForeignEntry {
    pub original_amount: Decimal,
    pub original_currency_code: String,
    pub exchange_rate: Decimal,
}

/// Check the three foreign-entry columns against each other and the wallet.
///
/// They travel together or not at all, the entry currency must differ from
/// the wallet's (otherwise it is not a foreign entry), and `amount` must be
/// what the rate produces. The last rule is what stops a client sending a
/// rate that does not match the figure it also sent.
pub fn validate_foreign_entry(
    entry: Option<&ForeignEntry>,
    wallet_currency: &str,
    amount: Decimal,
) -> Result<(), AppError> {
    let Some(entry) = entry else { return Ok(()) };

    if entry.original_amount <= Decimal::ZERO {
        return Err(AppError::validation([(
            "original_amount",
            "Enter an amount greater than zero.",
        )]));
    }
    if entry.exchange_rate <= Decimal::ZERO {
        return Err(AppError::validation([(
            "exchange_rate",
            "Enter a rate greater than zero.",
        )]));
    }
    if entry.original_currency_code == wallet_currency {
        return Err(AppError::validation([(
            "original_currency_code",
            "This is already the wallet's currency.",
        )]));
    }

    let expected = round_money(entry.original_amount * entry.exchange_rate);
    if expected != round_money(amount) {
        return Err(AppError::validation([(
            "amount",
            "The amount does not match the original and the rate.",
        )]));
    }

    Ok(())
}

/// Round to the money scale, half away from zero, and rescale to it.
///
/// Banker's rounding would make two equal halves round differently depending
/// on the digit before them, which is defensible statistically and surprising
/// on an invoice.
///
/// The rescale is not cosmetic. `50000` and `50000.0000` are the same number
/// and different strings, and both the wire format and the import
/// fingerprint are strings (D12, TXN-16).
pub fn round_money(value: Decimal) -> Decimal {
    let mut rounded =
        value.round_dp_with_strategy(MONEY_SCALE, RoundingStrategy::MidpointAwayFromZero);
    rounded.rescale(MONEY_SCALE);
    rounded
}

pub fn round_rate(value: Decimal) -> Decimal {
    let mut rounded =
        value.round_dp_with_strategy(RATE_SCALE, RoundingStrategy::MidpointAwayFromZero);
    rounded.rescale(RATE_SCALE);
    rounded
}

/// The content hash that makes a re-import a no-op (TXN-16, D29).
///
/// Computed from the transformed values, after date parsing and sign
/// normalization, so two files with different date formats produce the same
/// hash for the same transaction. Truncated to 24 hex characters, which is
/// 96 bits: far more than enough to separate the rows of one workspace, and
/// short enough to read in a log line.
pub fn fingerprint(
    wallet_id: &str,
    date: &str,
    amount: Decimal,
    currency: &str,
    name: &str,
    counterparty: &str,
) -> String {
    let mut hasher = Sha256::new();
    hasher.update(normalize(wallet_id));
    hasher.update(b"|");
    hasher.update(normalize(date));
    hasher.update(b"|");
    // The canonical decimal string, so 50000 and 50000.0000 hash alike.
    hasher.update(round_money(amount).to_string());
    hasher.update(b"|");
    hasher.update(normalize(currency));
    hasher.update(b"|");
    hasher.update(normalize(name));
    hasher.update(b"|");
    hasher.update(normalize(counterparty));

    hex(&hasher.finalize()[..12])
}

/// Lowercase, trimmed, runs of whitespace collapsed to one space.
fn normalize(value: &str) -> String {
    value
        .trim()
        .to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn decimal(value: &str) -> Decimal {
        value.parse().unwrap()
    }

    fn shape(
        kind: TransactionType,
        amount: &str,
        to: Option<&str>,
        to_amount: Option<&str>,
    ) -> TransactionShape {
        TransactionShape::validate(ProposedShape {
            kind,
            wallet_id: "w_a",
            to_wallet_id: to,
            amount: decimal(amount),
            to_amount: to_amount.map(decimal),
        })
        .unwrap()
    }

    // ------------------------------------------------------- arithmetic

    #[test]
    fn should_decrease_the_wallet_on_an_expense() {
        let effects = shape(TransactionType::Expense, "50000", None, None).effect();
        assert_eq!(
            effects,
            vec![BalanceDelta {
                wallet_id: "w_a".into(),
                delta: decimal("-50000")
            }]
        );
    }

    #[test]
    fn should_increase_the_wallet_on_an_income() {
        let effects = shape(TransactionType::Income, "9500000", None, None).effect();
        assert_eq!(
            effects,
            vec![BalanceDelta {
                wallet_id: "w_a".into(),
                delta: decimal("9500000")
            }]
        );
    }

    /// The worked example from docs/data-model.md#worked-examples: USD 50 out
    /// of Wise, IDR 812,500 into BCA. Two different figures move.
    #[test]
    fn should_move_two_different_figures_on_a_cross_currency_transfer() {
        let effects = shape(TransactionType::Transfer, "50", Some("w_b"), Some("812500")).effect();
        assert_eq!(
            effects,
            vec![
                BalanceDelta {
                    wallet_id: "w_a".into(),
                    delta: decimal("-50")
                },
                BalanceDelta {
                    wallet_id: "w_b".into(),
                    delta: decimal("812500")
                },
            ]
        );
    }

    #[test]
    fn should_move_one_figure_on_a_same_currency_transfer() {
        let effects = shape(TransactionType::Transfer, "100", Some("w_b"), Some("100")).effect();
        assert_eq!(effects[0].delta, decimal("-100"));
        assert_eq!(effects[1].delta, decimal("100"));
    }

    #[test]
    fn should_undo_exactly_what_it_did_when_reversed() {
        for case in [
            shape(TransactionType::Expense, "50000", None, None),
            shape(TransactionType::Income, "50000", None, None),
            shape(TransactionType::Transfer, "50", Some("w_b"), Some("812500")),
        ] {
            let applied = case.effect();
            let undone = net(applied.iter().cloned().chain(reverse(&applied)));
            assert!(undone.is_empty(), "{case:?} did not cancel out");
        }
    }

    #[test]
    fn should_net_an_update_against_the_same_wallet_into_one_move() {
        let old = shape(TransactionType::Expense, "50000", None, None);
        let new = shape(TransactionType::Expense, "87500", None, None);

        let moves = net(reverse(&old.effect()).into_iter().chain(new.effect()));

        assert_eq!(
            moves,
            vec![BalanceDelta {
                wallet_id: "w_a".into(),
                delta: decimal("-37500")
            }]
        );
    }

    /// Every one of the nine type transitions has to leave the wallet where
    /// applying the new transaction alone would have left it.
    #[test]
    fn should_recompute_every_type_transition() {
        let types = [
            TransactionType::Income,
            TransactionType::Expense,
            TransactionType::Transfer,
        ];

        for from in types {
            for to in types {
                let old = match from {
                    TransactionType::Transfer => shape(from, "50000", Some("w_b"), Some("50000")),
                    other => shape(other, "50000", None, None),
                };
                let new = match to {
                    TransactionType::Transfer => shape(to, "87500", Some("w_b"), Some("87500")),
                    other => shape(other, "87500", None, None),
                };

                // Reverse the old, apply the new.
                let moved = net(reverse(&old.effect()).into_iter().chain(new.effect()));

                // The same wallets, starting from the old transaction having
                // never existed.
                let expected = net(new.effect().into_iter().chain(reverse(&old.effect())));

                assert_eq!(moved, expected, "{from:?} -> {to:?}");
            }
        }
    }

    #[test]
    fn should_sort_moves_by_wallet_id_so_locks_cannot_deadlock() {
        let moves = net([
            BalanceDelta {
                wallet_id: "w_z".into(),
                delta: decimal("1"),
            },
            BalanceDelta {
                wallet_id: "w_a".into(),
                delta: decimal("1"),
            },
        ]);
        assert_eq!(moves[0].wallet_id, "w_a");
        assert_eq!(moves[1].wallet_id, "w_z");
    }

    // ------------------------------------------------------- validation

    #[test]
    fn should_refuse_an_amount_that_is_not_positive() {
        for bad in ["0", "-1"] {
            let error = TransactionShape::validate(ProposedShape {
                kind: TransactionType::Expense,
                wallet_id: "w_a",
                to_wallet_id: None,
                amount: decimal(bad),
                to_amount: None,
            })
            .unwrap_err();
            assert!(matches!(error, AppError::AmountNotPositive), "{bad}");
        }
    }

    #[test]
    fn should_refuse_a_transfer_without_a_destination() {
        let error = TransactionShape::validate(ProposedShape {
            kind: TransactionType::Transfer,
            wallet_id: "w_a",
            to_wallet_id: None,
            amount: decimal("1"),
            to_amount: Some(decimal("1")),
        })
        .unwrap_err();
        assert!(matches!(error, AppError::TransferRequiresDestination));
    }

    #[test]
    fn should_refuse_a_transfer_to_the_same_wallet() {
        let error = TransactionShape::validate(ProposedShape {
            kind: TransactionType::Transfer,
            wallet_id: "w_a",
            to_wallet_id: Some("w_a"),
            amount: decimal("1"),
            to_amount: Some(decimal("1")),
        })
        .unwrap_err();
        assert!(matches!(error, AppError::TransferSameWallet));
    }

    #[test]
    fn should_refuse_a_transfer_without_a_destination_amount() {
        let error = TransactionShape::validate(ProposedShape {
            kind: TransactionType::Transfer,
            wallet_id: "w_a",
            to_wallet_id: Some("w_b"),
            amount: decimal("1"),
            to_amount: None,
        })
        .unwrap_err();
        assert!(matches!(error, AppError::TransferAmountRequired));
    }

    #[test]
    fn should_refuse_a_destination_on_a_non_transfer() {
        let error = TransactionShape::validate(ProposedShape {
            kind: TransactionType::Expense,
            wallet_id: "w_a",
            to_wallet_id: Some("w_b"),
            amount: decimal("1"),
            to_amount: None,
        })
        .unwrap_err();
        assert!(matches!(error, AppError::DestinationNotAllowed));
    }

    #[test]
    fn should_refuse_a_destination_amount_on_a_non_transfer() {
        let error = TransactionShape::validate(ProposedShape {
            kind: TransactionType::Income,
            wallet_id: "w_a",
            to_wallet_id: None,
            amount: decimal("1"),
            to_amount: Some(decimal("1")),
        })
        .unwrap_err();
        assert!(matches!(error, AppError::TransferAmountRequired));
    }

    // --------------------------------------------------- foreign entry

    /// The worked example: USD 50 paid from an IDR wallet at 16,250.
    #[test]
    fn should_accept_a_foreign_entry_whose_arithmetic_holds() {
        let entry = ForeignEntry {
            original_amount: decimal("50"),
            original_currency_code: "USD".into(),
            exchange_rate: decimal("16250"),
        };
        validate_foreign_entry(Some(&entry), "IDR", decimal("812500")).unwrap();
    }

    #[test]
    fn should_refuse_a_foreign_entry_whose_amount_does_not_match_the_rate() {
        let entry = ForeignEntry {
            original_amount: decimal("50"),
            original_currency_code: "USD".into(),
            exchange_rate: decimal("16250"),
        };
        assert!(validate_foreign_entry(Some(&entry), "IDR", decimal("800000")).is_err());
    }

    #[test]
    fn should_refuse_a_foreign_entry_in_the_wallets_own_currency() {
        let entry = ForeignEntry {
            original_amount: decimal("50"),
            original_currency_code: "IDR".into(),
            exchange_rate: decimal("1"),
        };
        assert!(validate_foreign_entry(Some(&entry), "IDR", decimal("50")).is_err());
    }

    #[test]
    fn should_accept_no_foreign_entry_at_all() {
        validate_foreign_entry(None, "IDR", decimal("50000")).unwrap();
    }

    // ---------------------------------------------------- fingerprint

    #[test]
    fn should_hash_the_same_row_to_the_same_fingerprint() {
        let a = fingerprint(
            "w_a",
            "2026-11-02",
            decimal("50000"),
            "IDR",
            "Warung  Tekko",
            "",
        );
        let b = fingerprint(
            "w_a",
            "2026-11-02",
            decimal("50000.0000"),
            "idr",
            " warung tekko ",
            "",
        );
        assert_eq!(a, b, "normalization and canonical decimals have to agree");
        assert_eq!(a.len(), 24);
    }

    #[test]
    fn should_hash_different_rows_differently() {
        let base = fingerprint("w_a", "2026-11-02", decimal("50000"), "IDR", "Lunch", "");
        assert_ne!(
            base,
            fingerprint("w_b", "2026-11-02", decimal("50000"), "IDR", "Lunch", "")
        );
        assert_ne!(
            base,
            fingerprint("w_a", "2026-11-03", decimal("50000"), "IDR", "Lunch", "")
        );
        assert_ne!(
            base,
            fingerprint("w_a", "2026-11-02", decimal("50001"), "IDR", "Lunch", "")
        );
        assert_ne!(
            base,
            fingerprint("w_a", "2026-11-02", decimal("50000"), "USD", "Lunch", "")
        );
        assert_ne!(
            base,
            fingerprint("w_a", "2026-11-02", decimal("50000"), "IDR", "Dinner", "")
        );
    }

    // -------------------------------------------------------- rounding

    #[test]
    fn should_round_money_half_away_from_zero() {
        assert_eq!(round_money(decimal("0.00005")), decimal("0.0001"));
        assert_eq!(round_money(decimal("0.00015")), decimal("0.0002"));
        assert_eq!(round_money(decimal("-0.00005")), decimal("-0.0001"));
    }

    #[test]
    fn should_render_money_at_four_places_whatever_came_in() {
        assert_eq!(round_money(decimal("50000")).to_string(), "50000.0000");
        assert_eq!(round_money(decimal("50000.0000")).to_string(), "50000.0000");
        assert_eq!(round_rate(decimal("16250")).to_string(), "16250.00000000");
    }
}
