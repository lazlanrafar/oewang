/**
 * Everything fetched so far, across a `?page=` that only ever grows.
 *
 * A `load` hands the page one page of rows at a time (UI-8, D55), because the
 * page number is view state and view state lives in the URL. Infinite scroll
 * needs the rows from every page that has been asked for, and a load cannot
 * provide that: it returns the answer to one request. So the accumulation
 * sits here, outside the load, keyed by what the rows are an answer to.
 *
 * The key is every other query parameter, joined. The moment a filter, a
 * search term or a sort changes, the rows already held answer a different
 * question and are thrown away rather than appended to, which is what stops a
 * filtered list from showing the rows it just filtered out.
 */

export type PageOfRows<T> = {
	rows: T[];
	/** The `?page=` these rows answered. */
	page: number;
	/** Every other parameter, joined: what the rows are an answer to. */
	key: string;
};

export type PagedRows<T extends { id: string }> = {
	/** Every row fetched for the current key, in the order they arrived. */
	readonly rows: T[];
	/** The highest page seen for the current key. */
	readonly lastPage: number;
};

/**
 * Hold the rows from every page fetched for one key.
 *
 * A factory rather than a class, so the getters read as plain properties at
 * the call site and the state stays genuinely private: there is no instance
 * for a component to assign `rows` on by accident.
 */
export function pagedRows<T extends { id: string }>(): PagedRows<T> & {
	update(next: PageOfRows<T>): void;
} {
	let rows = $state<T[]>([]);
	let lastPage = $state(0);
	// Null rather than an empty string, because an empty query string is a
	// real key: the unfiltered list.
	let key = $state<string | null>(null);

	return {
		get rows() {
			return rows;
		},
		get lastPage() {
			return lastPage;
		},

		update(next: PageOfRows<T>) {
			if (next.key !== key) {
				// A different question. The rows held answer the old one.
				rows = next.rows;
				lastPage = next.page;
				key = next.key;
				return;
			}

			if (next.page <= lastPage) {
				// The same page again is fresh data, not more data: a row was
				// created, edited or deleted and the load reran. Appending
				// would show the page twice.
				rows = next.rows;
				lastPage = next.page;
				return;
			}

			// The list is ordered by date descending, then created_at
			// descending, so a row written between two page fetches pushes
			// everything after it down by one and the last row of page 1
			// arrives again as the first row of page 2. The duplicate is real,
			// not defensive: Svelte keys the list by id, and two rows with one
			// id is a crash rather than a cosmetic repeat.
			const held = new Set(rows.map((row) => row.id));
			rows = [...rows, ...next.rows.filter((row) => !held.has(row.id))];
			lastPage = next.page;
		}
	};
}
