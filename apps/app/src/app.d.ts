declare global {
	namespace App {
		interface Locals {
			/** Set by hooks.server.ts. Absent means signed out. */
			accessToken?: string;
		}
	}
}

export {};
