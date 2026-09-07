// Package cuid generates IDs compatible with @paralleldrive/cuid2, the
// package packages/database's Drizzle schemas use for every primary key
// (id text PRIMARY KEY $defaultFn(createId), no SQL-level DEFAULT — Postgres
// never generates these, the caller always must). github.com/nrednav/cuid2
// is a verified-compatible Go port (24-char lowercase alphanumeric,
// leading-letter — checked against @paralleldrive/cuid2 output directly
// during this port; see plan notes). Isolated behind this one file so a
// fallback (ULID/UUID) is a one-file swap if that ever changes.
package cuid

import "github.com/nrednav/cuid2"

// generate is initialized once at package load; cuid2.Init() only errors on
// an implausible entropy failure, which should crash the process anyway
// (every DB write in this service needs a working ID generator).
var generate = mustInit()

func mustInit() func() string {
	gen, err := cuid2.Init()
	if err != nil {
		panic("cuid: init: " + err.Error())
	}
	return gen
}

// New returns one CUID2-format id.
func New() string {
	return generate()
}
