import { baseConfig } from "./config-base";
import { onInitialize } from "./initialize";

// Client-side config — includes images/initialize for the dashboard
export default {
  ...baseConfig,
  onInitialize,
};
