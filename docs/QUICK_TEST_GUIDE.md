# Quick Test Commands

## ✅ Correct Commands

### Run E2E Tests
```bash
# From root - runs all E2E tests
bun run test:e2e

# From apps/app - run with UI
cd apps/app
bun run test:e2e:ui

# One-time auth setup (IMPORTANT - Do this first!)
cd apps/app
bun run test:e2e:login
```

### Run API Tests
```bash
# From root - run API tests only
cd /Users/boneconsulting/Developer/oewang
bun test ./apps/api/modules/**/*.test.ts
bun test ./apps/api/test/integration/**/*.test.ts

# Or use npm scripts
bun run test:unit          # API unit tests
bun run test:integration   # API integration tests (needs DB)
```

### Run All Tests
```bash
# Sequential (recommended)
bun run test:all

# Or manually
bun test ./apps/api/**/*.test.ts
bun run test:e2e
```

## ❌ Don't Use

```bash
# DON'T run "bun test" from root without path
# It will try to run Playwright tests with Bun (which fails)
bun test  # ❌ WRONG
```

## 🎯 Recommended Workflow

### First Time Setup
```bash
# 1. Set up auth (one-time)
cd apps/app
bun run test:e2e:login
# Log in and create workspace in browser
# Session is saved for all future tests!

# 2. Go back to root
cd ../..

# 3. Run tests
bun run test:e2e
```

### Daily Development
```bash
# E2E with UI (best for development)
cd apps/app
bun run test:e2e:ui

# Or from root
bun run test:e2e:ui
```

## 📊 Test Structure

```
E2E Tests (Playwright) - Use: bun run test:e2e
  └─ apps/app/e2e/*.spec.ts (16 files)
  
API Tests (Bun) - Use: bun test ./apps/api/**/*.test.ts
  ├─ apps/api/modules/**/*.test.ts (unit tests)
  └─ apps/api/test/integration/**/*.test.ts (integration)
```

## 🚀 Quick Reference

| What | Command | Where |
|------|---------|-------|
| Auth Setup (once) | `bun run test:e2e:login` | `apps/app` |
| E2E Tests | `bun run test:e2e` | root |
| E2E UI Mode | `bun run test:e2e:ui` | root |
| API Unit Tests | `bun test ./apps/api/modules/**/*.test.ts` | root |
| API Integration | `bun run test:integration` | root |
| All Tests | `bun run test:all` | root |
