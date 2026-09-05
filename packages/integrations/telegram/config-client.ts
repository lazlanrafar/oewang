import { baseConfig } from "./config-base";
import { onInitialize } from "./initialize";

// Client-side config with images - only imported by Next.js dashboard
export default {
  ...baseConfig,
  onInitialize,
};
