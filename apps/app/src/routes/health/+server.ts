import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

/**
 * Liveness, for the container health check.
 *
 * Deliberately only liveness. The web app's one dependency is the API, and
 * the API answers for itself at `/health`; calling it from here would make
 * this container unhealthy whenever that one is, and an orchestrator would
 * then restart a process that is working. A readiness check that reports
 * somebody else's outage takes the wrong thing down.
 *
 * It holds no session and reads no cookie, so it is listed as public in
 * `hooks.server.ts`: a health check that has to log in is not one. It also
 * discloses nothing, which is why the body is a constant rather than a
 * version or a commit.
 */
export const GET: RequestHandler = () =>
	json({ status: 'ok' }, { headers: { 'cache-control': 'no-store' } });
