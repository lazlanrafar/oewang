//! The operator console's API (CSL, D124 to D126): routes under
//! `/v1/console`, each taking an [`operator::Operator`] and checking one
//! permission. See docs/features/console.md.

pub mod handler;
pub mod operator;
pub mod service;
#[cfg(test)]
mod tests;
