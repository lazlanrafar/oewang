package cuid

import (
	"regexp"
	"testing"

	"github.com/stretchr/testify/assert"
)

var cuidFormat = regexp.MustCompile(`^[a-z][a-z0-9]{23}$`)

func TestNew_MatchesCuid2Format(t *testing.T) {
	id := New()
	assert.Regexp(t, cuidFormat, id)
}

func TestNew_ReturnsDistinctIDs(t *testing.T) {
	seen := make(map[string]struct{})
	for i := 0; i < 100; i++ {
		id := New()
		_, dup := seen[id]
		assert.False(t, dup, "duplicate id generated: %s", id)
		seen[id] = struct{}{}
	}
}
