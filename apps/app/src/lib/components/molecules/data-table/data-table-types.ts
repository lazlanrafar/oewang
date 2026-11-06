/**
 * The types the table shell itself speaks.
 *
 * A row model belongs to the feature whose rows they are, not here: this
 * module is the design system and knows nothing about what a row holds.
 */

/** An option a cell picks from: an id, a name, and optionally a colour. */
export type NamedOption = { id: string; name: string; colorClass?: string };

/**
 * A sort, or the absence of one, which is the third click.
 *
 * The key is the caller's own union of sortable column keys, so a sort over
 * a column the server cannot order by is a typecheck error rather than a
 * request that comes back unsorted.
 */
export type TableSort<K extends string = string> = { key: K | null; descending: boolean };

/**
 * One block of rows under a heading, such as a day.
 *
 * The key is whatever the caller groups by, and it is what the shell uses
 * to remember which blocks are shut. An empty key means a block with no
 * heading, which is what an ungrouped table is.
 */
export type RowGroup<Row> = { key: string; rows: Row[] };

/**
 * What a column's cells look like while the rows are loading, as the old
 * app's `meta.skeleton` types them: a bar of text, a checkbox, a dot or an
 * avatar before text, a badge, a pair of tags, or an icon.
 */
export type SkeletonType =
	| 'checkbox'
	| 'text'
	| 'avatar-text'
	| 'icon-text'
	| 'badge'
	| 'tags'
	| 'icon';

/** A column's loading cell: its shape, and the Tailwind width of its bar. */
export type SkeletonSpec = { type: SkeletonType; width?: string };
