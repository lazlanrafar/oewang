/**
 * Generic artifact configuration for status indicators
 * Supports all canvas types that use the standard stage pattern
 */

export type ArtifactStage =
  | "loading"
  | "chart_ready"
  | "metrics_ready"
  | "analysis_ready"
  | "data_ready";

export type ArtifactType =
  | "burn-rate-canvas"
  | "revenue-canvas"
  | "spending-canvas"
  | "debt-canvas"
  | "budget-canvas";

/**
 * Maps tool names to artifact types
 * This is exported for use in components that need to find tool names from artifact types
 */
export const TOOL_TO_ARTIFACT_MAP: Record<string, ArtifactType> = {
  getBurnRate: "burn-rate-canvas",
  getRevenueSummary: "revenue-canvas",
  getSpendingAnalysis: "spending-canvas",
  getDebtAnalysis: "debt-canvas",
  getBudgetStatus: "budget-canvas",
};

/**
 * Maps artifact stages to section names
 */
export const STAGE_TO_SECTION_MAP: Record<ArtifactStage, string | null> = {
  loading: "Chart",
  chart_ready: "Metrics",
  metrics_ready: "Summary",
  analysis_ready: null, // Complete, no section in progress
  data_ready: "Summary",
};

/**
 * Default stage messages (used when no custom message is defined)
 */
const DEFAULT_STAGE_MESSAGES: Record<ArtifactStage, string> = {
  loading: "Preparing analysis...",
  chart_ready: "Chart data ready, calculating metrics...",
  metrics_ready: "Metrics calculated, generating insights...",
  analysis_ready: "Analysis complete",
  data_ready: "Data ready, generating insights...",
};

/**
 * Custom stage messages per artifact type (overrides defaults)
 */
const CUSTOM_STAGE_MESSAGES: Partial<
  Record<ArtifactType, Partial<Record<ArtifactStage, string>>>
> = {
  "burn-rate-canvas": {
    loading: "Preparing burn rate analysis...",
    chart_ready: "Chart data ready, calculating metrics...",
    metrics_ready: "Metrics calculated, generating insights...",
    analysis_ready: "Analysis complete",
  },
  "revenue-canvas": {
    loading: "Preparing revenue analysis...",
    chart_ready: "Chart data ready, calculating metrics...",
    metrics_ready: "Metrics calculated, generating insights...",
    analysis_ready: "Analysis complete",
  },
  "spending-canvas": {
    loading: "Preparing spending analysis...",
    chart_ready: "Chart data ready, calculating metrics...",
    metrics_ready: "Metrics calculated, generating insights...",
    analysis_ready: "Analysis complete",
  },
  "debt-canvas": {
    loading: "Preparing debt summary...",
    metrics_ready: "Totals calculated, generating insights...",
    analysis_ready: "Analysis complete",
  },
  "budget-canvas": {
    loading: "Preparing budget status...",
    metrics_ready: "Totals calculated, generating insights...",
    analysis_ready: "Analysis complete",
  },
};

/**
 * Default section messages
 */
const DEFAULT_SECTION_MESSAGES: Record<string, string> = {
  Chart: "Loading chart data...",
  Metrics: "Calculating metrics...",
  Summary: "Generating analysis...",
};

/**
 * Custom section messages per artifact type (overrides defaults)
 */
const CUSTOM_SECTION_MESSAGES: Partial<
  Record<ArtifactType, Partial<Record<string, string>>>
> = {
  "burn-rate-canvas": {
    Chart: "Loading chart data...",
    Metrics: "Calculating metrics...",
    Summary: "Generating analysis...",
  },
};

/**
 * Get artifact type from tool name
 */
export function getArtifactTypeFromTool(
  toolName: string | null,
): ArtifactType | null {
  if (!toolName) return null;
  return TOOL_TO_ARTIFACT_MAP[toolName] || null;
}

/**
 * Get stage message for an artifact type and stage
 */
export function getArtifactStageMessageForStatus(
  artifactType: ArtifactType | null,
  stage: ArtifactStage | null,
): string | null {
  if (!stage || !artifactType) return null;

  // Check for custom message first
  const customMessages = CUSTOM_STAGE_MESSAGES[artifactType];
  if (customMessages?.[stage]) {
    return customMessages[stage];
  }

  // Fall back to default
  return DEFAULT_STAGE_MESSAGES[stage] || null;
}

/**
 * Get section message for an artifact type and section
 */
export function getArtifactSectionMessageForStatus(
  artifactType: ArtifactType | null,
  section: string | null,
): string | null {
  if (!section || !artifactType) return null;

  // Check for custom message first
  const customMessages = CUSTOM_SECTION_MESSAGES[artifactType];
  if (customMessages?.[section]) {
    return customMessages[section];
  }

  // Fall back to default
  return DEFAULT_SECTION_MESSAGES[section] || null;
}

/**
 * Get section name from stage
 */
export function getSectionFromStage(
  stage: ArtifactStage | null,
): string | null {
  if (!stage) return null;
  return STAGE_TO_SECTION_MAP[stage] || null;
}
