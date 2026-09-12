import { t, type UnwrapSchema } from "elysia";

export const DeviceTokenDto = {
  register: t.Object({
    token: t.String(),
    platform: t.Union([t.Literal("ios"), t.Literal("android")]),
  }),
  unregister: t.Object({
    token: t.String(),
  }),
  testSend: t.Object({
    user_id: t.Optional(t.String()),
    title: t.String(),
    body: t.String(),
  }),
};

export type RegisterDeviceTokenInput = UnwrapSchema<
  typeof DeviceTokenDto.register
>;
export type UnregisterDeviceTokenInput = UnwrapSchema<
  typeof DeviceTokenDto.unregister
>;
export type TestSendInput = UnwrapSchema<typeof DeviceTokenDto.testSend>;
