/**
 * Reading a delimited file in the browser.
 *
 * Only the shape is read here: column names and cell text. Nothing is
 * parsed into a number or a date, because those happen in Rust where a
 * decimal point cannot move (D28). What this file produces is strings.
 */

export type ParsedFile = {
	columns: string[];
	rows: Array<Record<string, string>>;
	/** Rows the file had but the parser dropped, with the reason. */
	dropped: number;
};

/** A CSV, a semicolon-separated file, or a tab-separated one. */
export function detectDelimiter(sample: string): string {
	const line = sample.split(/\r?\n/).find((candidate) => candidate.trim() !== '') ?? '';
	const counts = [',', ';', '\t'].map((delimiter) => ({
		delimiter,
		count: splitLine(line, delimiter).length
	}));

	return counts.sort((a, b) => b.count - a.count)[0]?.delimiter ?? ',';
}

/**
 * Split one line, honouring RFC 4180 quoting.
 *
 * A quoted field may hold the delimiter and a doubled quote, which is how
 * every bank writes a description with a comma in it.
 */
function splitLine(line: string, delimiter: string): string[] {
	const fields: string[] = [];
	let field = '';
	let quoted = false;

	for (let index = 0; index < line.length; index += 1) {
		const character = line[index];

		if (quoted) {
			if (character === '"') {
				if (line[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					quoted = false;
				}
			} else {
				field += character;
			}
			continue;
		}

		if (character === '"') quoted = true;
		else if (character === delimiter) {
			fields.push(field);
			field = '';
		} else field += character;
	}

	fields.push(field);
	return fields;
}

/**
 * Split the text into lines, keeping a newline that sits inside quotes.
 *
 * A description with a line break in it is one row, not two.
 */
function splitRecords(text: string): string[] {
	const records: string[] = [];
	let record = '';
	let quoted = false;

	for (let index = 0; index < text.length; index += 1) {
		const character = text[index];

		if (character === '"') {
			// A doubled quote inside a quoted field stays doubled here:
			// unescaping is `splitLine`'s job, and halving it now would
			// leave an odd number of quotes for it to misread.
			if (quoted && text[index + 1] === '"') {
				record += '""';
				index += 1;
			} else {
				quoted = !quoted;
				record += character;
			}
			continue;
		}

		if (!quoted && (character === '\n' || character === '\r')) {
			if (character === '\r' && text[index + 1] === '\n') index += 1;
			records.push(record);
			record = '';
			continue;
		}

		record += character;
	}

	if (record !== '') records.push(record);
	return records;
}

export function parseDelimited(text: string, delimiter = detectDelimiter(text)): ParsedFile {
	// A byte order mark on the first header would make that column's name
	// unmatchable, and every Excel export from Windows has one.
	const records = splitRecords(text.replace(/^﻿/, '')).filter(
		(record) => record.trim() !== ''
	);
	if (records.length === 0) return { columns: [], rows: [], dropped: 0 };

	const columns = splitLine(records[0], delimiter).map((name, index) => {
		const trimmed = name.trim();
		// An unnamed column still has to be addressable by the mapping.
		return trimmed === '' ? `Column ${index + 1}` : trimmed;
	});

	const rows: Array<Record<string, string>> = [];
	let dropped = 0;

	for (const record of records.slice(1)) {
		const fields = splitLine(record, delimiter);
		// A row with more fields than headers is malformed; one with fewer
		// is a short row, which is ordinary and padded.
		if (fields.length > columns.length) {
			dropped += 1;
			continue;
		}

		rows.push(
			Object.fromEntries(columns.map((column, index) => [column, (fields[index] ?? '').trim()]))
		);
	}

	return { columns, rows, dropped };
}
