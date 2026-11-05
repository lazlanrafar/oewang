//! Reports: the overview page and the chat's analysis canvases (D87, D88).
//!
//! One owner for every figure either surface shows, so the overview and a
//! canvas opened from the chat cannot disagree about the same month. Every
//! number is computed and formatted here (D27); the web app draws it and the
//! model reads it, and neither does arithmetic on it.

pub mod handler;
pub mod service;

#[cfg(test)]
mod tests;
