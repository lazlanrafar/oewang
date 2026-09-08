package repo

import (
	"context"
	"regexp"
	"testing"

	"github.com/pashagolub/pgxmock/v4"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImportJobsRepo_MarkSucceeded_UpdatesStatusAndCounts(t *testing.T) {
	mock := newMockPool(t)
	repo := &ImportJobsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("SET status = 'succeeded'")).
		WithArgs("job-1", 10, 2).
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := repo.MarkSucceeded(context.Background(), "job-1", 10, 2)
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestImportJobsRepo_MarkFailed_UpdatesStatusAndError(t *testing.T) {
	mock := newMockPool(t)
	repo := &ImportJobsRepo{Pool: mock}

	mock.ExpectExec(regexp.QuoteMeta("SET status = 'failed'")).
		WithArgs("job-1", "extraction failed").
		WillReturnResult(pgxmock.NewResult("UPDATE", 1))

	err := repo.MarkFailed(context.Background(), "job-1", "extraction failed")
	require.NoError(t, err)
	assert.NoError(t, mock.ExpectationsWereMet())
}
