//! Transactional email, through Resend (D40).
//!
//! Only two messages exist: a password reset and a workspace invite. Both
//! carry a bearer credential in a link, so neither the token nor the body is
//! ever logged (OPS-3).
//!
//! Sending never fails a request. A reset endpoint that returns 500 because
//! an email provider is down tells the caller the address exists, which is
//! exactly what AUTH-10 is written to prevent.

use serde::Serialize;

#[derive(Clone)]
pub enum Mailer {
    Resend(ResendMailer),
    /// Development: log that a message would have been sent, with the link,
    /// so a reset can be completed without a provider. Refused outside
    /// development by the configuration.
    Console { app_url: String },
}

#[derive(Clone)]
pub struct ResendMailer {
    client: reqwest::Client,
    api_key: String,
    from: String,
    app_url: String,
}

#[derive(Serialize)]
struct ResendPayload<'a> {
    from: &'a str,
    to: [&'a str; 1],
    subject: &'a str,
    text: &'a str,
}

impl Mailer {
    pub fn resend(api_key: String, from: String, app_url: String) -> Self {
        Mailer::Resend(ResendMailer {
            client: reqwest::Client::new(),
            api_key,
            from,
            app_url,
        })
    }

    pub fn console(app_url: String) -> Self {
        Mailer::Console { app_url }
    }

    pub async fn send_password_reset(&self, email: &str, raw_token: &str) {
        let link = format!("{}/reset-password?token={}", self.app_url(), raw_token);
        self.send(
            email,
            "Reset your oewang password",
            &format!(
                "Open this link to set a new password. It works once and expires in one hour.\n\n{link}\n\nIf you did not ask for this, ignore it; nothing has changed."
            ),
            "password reset",
        )
        .await;
    }

    pub async fn send_workspace_invite(&self, email: &str, raw_token: &str) {
        let link = format!("{}/accept-invite?token={}", self.app_url(), raw_token);
        self.send(
            email,
            "You have been invited to an oewang workspace",
            &format!("Open this link to join. It expires in seven days.\n\n{link}"),
            "workspace invite",
        )
        .await;
    }

    fn app_url(&self) -> &str {
        match self {
            Mailer::Resend(mailer) => &mailer.app_url,
            Mailer::Console { app_url } => app_url,
        }
    }

    async fn send(&self, to: &str, subject: &str, body: &str, kind: &'static str) {
        match self {
            Mailer::Console { .. } => {
                // The body carries the link, which is a credential. Printed
                // only because this mode cannot run outside development.
                tracing::info!(kind, to, "email (console mailer)\n{body}");
            }
            Mailer::Resend(mailer) => {
                let payload = ResendPayload {
                    from: &mailer.from,
                    to: [to],
                    subject,
                    text: body,
                };

                let result = mailer
                    .client
                    .post("https://api.resend.com/emails")
                    .bearer_auth(&mailer.api_key)
                    .json(&payload)
                    .send()
                    .await;

                match result {
                    Ok(response) if response.status().is_success() => {
                        tracing::info!(kind, "email sent");
                    }
                    Ok(response) => {
                        // Status only. The body can echo the address back.
                        tracing::error!(kind, status = %response.status(), "email provider refused");
                    }
                    Err(error) => {
                        tracing::error!(kind, %error, "email provider unreachable");
                    }
                }
            }
        }
    }
}

impl std::fmt::Debug for Mailer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Mailer::Resend(_) => f.write_str("Mailer::Resend([redacted])"),
            Mailer::Console { .. } => f.write_str("Mailer::Console"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_not_print_the_api_key() {
        let mailer = Mailer::resend(
            "re_live_secret_key".into(),
            "oewang <no-reply@example.com>".into(),
            "https://app.example.com".into(),
        );
        assert!(!format!("{mailer:?}").contains("secret"));
    }

    #[tokio::test]
    async fn should_not_panic_on_the_console_mailer() {
        let mailer = Mailer::console("http://localhost:3000".into());
        mailer.send_password_reset("a@b.com", "token").await;
        mailer.send_workspace_invite("a@b.com", "token").await;
    }
}
