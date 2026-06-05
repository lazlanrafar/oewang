import { t } from "elysia";

export const AgentSettingsResponseDto = t.Object({
  id: t.String(),
  workspace_id: t.String(),
  model: t.String(),
  temperature: t.String(),
  max_steps: t.Number(),
  custom_instructions: t.Nullable(t.String()),
  response_language: t.String(),
  created_at: t.Date(),
  updated_at: t.Date(),
});

export const UpdateAgentSettingsDto = t.Object({
  model: t.Optional(
    t.Union([
      t.Literal("gpt-4o-mini"),
      t.Literal("gpt-4o"),
      t.Literal("claude-3-5-haiku-20241022"),
      t.Literal("claude-3-5-sonnet-20241022"),
    ]),
  ),
  temperature: t.Optional(t.Number({ minimum: 0, maximum: 1 })),
  max_steps: t.Optional(t.Integer({ minimum: 3, maximum: 20 })),
  custom_instructions: t.Optional(t.Nullable(t.String({ maxLength: 2000 }))),
  response_language: t.Optional(
    t.Union([t.Literal("auto"), t.Literal("english"), t.Literal("indonesian")]),
  ),
});
