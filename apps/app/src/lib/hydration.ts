/**
 * Whether the first render in the browser is over.
 *
 * A server-rendered page already shows its real content, so anything that
 * animates in on mount would, during hydration, first snap back to its
 * starting point and then animate to where it already was. A component reads
 * `hydrated()` while it is set up: false means it is taking over markup the
 * server sent and should show its end state; true means it is new on screen,
 * after a client-side navigation or a streamed value, and may animate.
 *
 * The root layout flips it once, a task after it mounts. Hydration creates
 * the whole initial tree synchronously, so by then every component the
 * server rendered has already read it.
 */
let done = false;

export function hydrated(): boolean {
	return done;
}

export function markHydrated(): void {
	setTimeout(() => {
		done = true;
	});
}
