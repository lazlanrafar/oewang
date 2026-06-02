# Testing Setup Guide

Quick guide to get your tests running.

## 🚀 Quick Setup (5 minutes)

### Step 1: Install Dependencies (if not already done)
```bash
bun install
bunx playwright install --with-deps chromium
```

### Step 2: Set Up Test Database
```bash
# Create test database
createdb oewang_test

# Push schema
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/oewang_test bun run db:push
```

### Step 3: Set Up Authentication

Choose one of these options:

#### Option A: Manual Setup (Recommended for first time)
```bash
cd apps/app
bun run test:e2e:login
```

This will:
1. Open a browser
2. Let you log in manually (with existing account or create new one)
3. Let you create a workspace if needed
4. Save the session for all future tests

#### Option B: Automated Setup (Using environment variables)
```bash
# Set environment variables
export PLAYWRIGHT_USER="your-test-email@example.com"
export PLAYWRIGHT_PASS="your-test-password"

# Run tests (will auto-login)
bun run test:e2e
```

**Note:** If you're a first-time user, Option A is easier because it lets you complete workspace creation manually.

### Step 4: Run Tests
```bash
# Run all E2E tests
bun run test:e2e

# Run in interactive UI mode (recommended for debugging)
bun run test:e2e:ui

# Run specific test file
bun test apps/app/e2e/transactions.spec.ts

# Run all tests (E2E + API + Unit)
bun run test:all
```

## 🎯 Test Commands Reference

```bash
# E2E Tests
bun run test:e2e              # Run all E2E tests
bun run test:e2e:ui           # Run with Playwright UI (interactive)
bun run test:e2e:login        # Manual auth setup (one-time)

# API Tests
bun run test:integration      # Run API integration tests

# All Tests
bun run test:all              # Run everything
bun run test:watch            # Watch mode for development
bun run test:coverage         # With coverage report
```

## 🐛 Troubleshooting

### "PLAYWRIGHT_USER and PLAYWRIGHT_PASS not set"
**Solution:** Run manual setup:
```bash
cd apps/app
bun run test:e2e:login
```

### "First-time user detected - workspace needs to be created"
**Solution:** Complete the one-time manual setup to create a workspace:
```bash
cd apps/app
bun run test:e2e:login
# Log in and create workspace in the browser
```

### "Cannot connect to database"
**Solution:** Ensure PostgreSQL is running:
```bash
docker compose up -d postgres
```

### Tests timing out
**Solution:** Make sure dev server is running:
```bash
# Terminal 1
bun run dev

# Terminal 2
bun run test:e2e
```

### "Playwright browser not installed"
**Solution:** Install Playwright browsers:
```bash
bunx playwright install --with-deps chromium
```

## ✅ Verification

Run this to verify everything is set up correctly:
```bash
./scripts/verify-tests.sh
```

## 📚 Full Documentation

For detailed guides, see the `docs/` directory:
- `docs/TESTING_README.md` - Complete testing guide
- `docs/TEST_COVERAGE.md` - Coverage report
- `docs/TEST_EXAMPLES.md` - Code examples

## 🎉 You're Ready!

Once setup is complete, tests will run automatically on every PR via GitHub Actions.

Local development workflow:
```bash
# 1. Make changes to code
# 2. Run tests
bun run test:e2e:ui

# 3. Fix any failures
# 4. Commit and push (tests run in CI)
```
