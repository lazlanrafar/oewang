declare global {
	namespace App {
		/**
		 * What `error()` sends the browser, beside the code in `message`: the
		 * plan feature a `FEATURE_NOT_IN_PLAN` refusal names (PLN-7). Read
		 * back by `readRefusal` in `$lib/errors`.
		 */
		interface Error {
			feature?: string;
		}
		interface Locals {
			/** Set by hooks.server.ts. Absent means signed out. */
			accessToken?: string;
		}
	}
}

export {};
