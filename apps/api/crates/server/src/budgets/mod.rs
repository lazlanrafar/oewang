//! Monthly budgets on expense categories, and what each has used (BUD-1 to
//! BUD-4, D103). The status read is shared by the page and the
//! `get_budget_status` chat tool, so the table and the canvas cannot
//! disagree.

pub mod handler;
pub mod service;

#[cfg(test)]
mod tests;
