//! The MCP server (D106): external AI clients reach oewang's data through
//! the web's own handlers, with a token the person made or approved.

pub mod budget;
pub mod caller;
pub mod handler;
pub mod oauth;
pub mod protocol;
pub mod registry;
pub mod service;
#[cfg(test)]
mod tests;
pub mod tokens;
pub mod tools;
