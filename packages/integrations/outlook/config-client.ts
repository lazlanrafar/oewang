import { baseConfig } from "./config-base";
import { onInitialize } from "./initialize";

export default {
  ...baseConfig,
  onInitialize,
  images: [require("./assets/outlook.jpg")],
};
