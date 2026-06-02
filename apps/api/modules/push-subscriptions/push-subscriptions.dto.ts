import { t, type UnwrapSchema } from "elysia";

export const PushSubscriptionDto = {
  register: t.Object({
    subscription: t.String(),
  }),
  unregister: t.Object({
    endpoint: t.String(),
  }),
};

export type RegisterPushSubscriptionInput = UnwrapSchema<
  typeof PushSubscriptionDto.register
>;
export type UnregisterPushSubscriptionInput = UnwrapSchema<
  typeof PushSubscriptionDto.unregister
>;
