#!/bin/bash

# Test Verification Script
# Verifies that the testing infrastructure is set up correctly

echo "🧪 Verifying test infrastructure..."
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check functions
check_command() {
  if command -v $1 &> /dev/null; then
    echo -e "${GREEN}✓${NC} $1 is installed"
    return 0
  else
    echo -e "${RED}✗${NC} $1 is not installed"
    return 1
  fi
}

check_file() {
  if [ -f "$1" ]; then
    echo -e "${GREEN}✓${NC} $1 exists"
    return 0
  else
    echo -e "${RED}✗${NC} $1 not found"
    return 1
  fi
}

check_directory() {
  if [ -d "$1" ]; then
    echo -e "${GREEN}✓${NC} $1 directory exists"
    return 0
  else
    echo -e "${RED}✗${NC} $1 directory not found"
    return 1
  fi
}

# 1. Check required commands
echo "📦 Checking dependencies..."
check_command bun
check_command psql
check_command docker
echo ""

# 2. Check test directories
echo "📁 Checking test structure..."
check_directory "apps/api/test"
check_directory "apps/api/test/helpers"
check_directory "apps/api/test/integration"
check_directory "packages/database/test/factories"
check_directory "packages/playwright/page-objects"
check_directory "apps/app/e2e"
echo ""

# 3. Check test files
echo "📄 Checking test files..."
check_file "apps/api/test/setup.ts"
check_file "apps/api/test/helpers/test-client.ts"
check_file "apps/api/test/integration/health.test.ts"
check_file "packages/database/test/factories/index.ts"
check_file "packages/playwright/page-objects/base-page.ts"
check_file ".env.test"
echo ""

# 4. Check CI/CD
echo "🔄 Checking CI/CD configuration..."
check_file ".github/workflows/test.yml"
check_file ".github/workflows/pr-checks.yml"
echo ""

# 5. Check database
echo "🗄️  Checking test database..."
if psql -lqt | cut -d \| -f 1 | grep -qw oewang_test; then
  echo -e "${GREEN}✓${NC} Test database 'oewang_test' exists"
else
  echo -e "${YELLOW}⚠${NC}  Test database 'oewang_test' not found"
  echo "   Run: createdb oewang_test"
fi
echo ""

# 6. Check package.json scripts
echo "📜 Checking package.json scripts..."
if grep -q "test:all" package.json; then
  echo -e "${GREEN}✓${NC} Test scripts configured"
else
  echo -e "${RED}✗${NC} Test scripts missing in package.json"
fi
echo ""

# 7. Run quick test
echo "🧪 Running quick health check..."
if bun test apps/api/test/integration/health.test.ts &> /dev/null; then
  echo -e "${GREEN}✓${NC} Health test passed"
else
  echo -e "${YELLOW}⚠${NC}  Health test failed (may need API running)"
fi
echo ""

# Summary
echo "================================"
echo "📊 Verification Summary"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Set up test database: ${YELLOW}bun run test:db:setup${NC}"
echo "2. Run all tests: ${YELLOW}bun run test:all${NC}"
echo "3. Run E2E with UI: ${YELLOW}bun run test:e2e:ui${NC}"
echo "4. View documentation: ${YELLOW}cat TESTING_README.md${NC}"
echo ""
echo "Done! 🎉"
