# Test Database Setup

## Quick Setup

```bash
# Create test database
createdb oewang_test

# Push schema to test database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oewang_test bun run db:push

# Verify connection
psql postgresql://postgres:postgres@localhost:5432/oewang_test -c "\dt"
```

## Reset Test Database

```bash
# Drop and recreate
dropdb oewang_test && createdb oewang_test

# Push schema again
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oewang_test bun run db:push
```

## Run Tests with Test Database

```bash
# Tests will automatically use .env.test when NODE_ENV=test
NODE_ENV=test bun test

# Or use the npm scripts
bun run test:integration
```
