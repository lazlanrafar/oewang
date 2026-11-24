/**
 * Turning a drag's result into `sort_order` writes, shared by every screen
 * that reorders rows (categories, wallet groups, wallets).
 */

/**
 * The siblings in the order the browser sent.
 *
 * The browser's list is a request, not the truth: an id that is not one of
 * the siblings is dropped, and a sibling it left out (one created in
 * another tab since the page loaded) keeps its place after the rest.
 * Positions are rewritten from the result rather than nudged, because
 * seeded rows all carry `sort_order` 0 and nudging one would move nothing.
 */
export function reorder<T extends { id: string }>(siblings: T[], ids: string[]): T[] {
	const byId = new Map(siblings.map((row) => [row.id, row]));
	const listed = [...new Set(ids)].flatMap((id) => byId.get(id) ?? []);
	const rest = siblings.filter((row) => !listed.includes(row));
	return [...listed, ...rest];
}

/** The rows whose `sort_order` must change for `order` to hold, with the new value. */
export function sortOrderChanges<T extends { id: string; sort_order: number }>(
	order: T[]
): Array<{ id: string; sort_order: number }> {
	return order
		.map((row, index) => ({ row, index }))
		.filter(({ row, index }) => row.sort_order !== index)
		.map(({ row, index }) => ({ id: row.id, sort_order: index }));
}
