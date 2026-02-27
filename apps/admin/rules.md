# Next.js App Rules

> [!TIP]
> **AI Assistant Reference**: Read this file at the start of every session to ensure compliance with the app's standards.

## 1. Directory Structure

```
apps/app/
├── app/                    # Next.js App Router
│   ├── [locale]/           # i18n locale prefix
│   │   ├── (auth)/         # Auth route group (login, register, create-workspace)
│   │   │   ├── actions.ts  # Server actions for auth
│   │   │   └── layout.tsx  # Auth layout
│   │   └── (main)/         # Main app route group
│   │       └── dashboard/  # Dashboard pages + components
│   └── api/                # API routes (auth callback, etc.)
├── config/                 # App configuration (app-config.ts)
├── data/                   # Static/mock data
├── dictionaries/           # i18n translations (en, id, ja)
├── lib/                    # Shared utilities (axios, cookies, fonts, preferences)
├── modules/                # Feature modules (API service layers)
│   ├── users/
│   │   └── services.ts     # User API calls (sync_user, etc.)
│   └── workspaces/
│       └── services.ts     # Workspace API calls (create_workspace, get_me, etc.)
├── navigation/             # Sidebar navigation config
├── server/                 # Server-side utilities (server-actions.ts)
├── stores/                 # Zustand stores (preferences)
└── middleware.ts            # Auth + locale middleware
```

## 2. Naming Conventions

Follow the root `rules.md` strictly:

- **Variables & Data**: `snake_case` — `is_loading`, `sync_result`, `user_workspaces`
- **React Props & Interfaces**: `camelCase` — `isActive`, `onClick`, `currentUser` (as prop names)
- **Files & Directories**: `kebab-case` — `create-workspace/`, `app-sidebar.tsx`
- **Components**: `PascalCase` — `AppSidebar`, `AccountSwitcher`
- **Functions**: `snake_case` — `sync_user`, `create_workspace`, `get_me`

## 3. API Communication

### Rules

1. **All API calls MUST go through `modules/<feature>/services.ts`**.
2. **DO NOT** make direct `fetch` or `axios` calls to the API in pages, layouts, server actions, or components.
3. Use the shared `axiosInstance` from `lib/axios.ts` inside service files.
4. For authenticated endpoints, pass the `token` parameter to service functions.

### Example

```typescript
// ✅ CORRECT — Use module service
import { get_me } from "@/modules/workspaces/services";
const data = await get_me(session.access_token);

// ❌ INCORRECT — Direct fetch in layout/page
const response = await fetch(`${process.env.API_URL}/users/me`, { ... });
```

## 4. Feature Modules

Each feature module in `modules/` should contain:

- **`services.ts`** — API call functions (exported as `snake_case`)
- Types/interfaces for DTOs and responses

```typescript
// modules/workspaces/services.ts
export const create_workspace = async (
  data: CreateWorkspaceDTO,
  token: string,
): Promise<{ workspace: Workspace }> => { ... };
```

## 5. Authentication Flow

1. **Supabase** handles auth (email/password + OAuth).
2. After auth, `/api/auth/callback` → calls `sync_user()` → checks `has_workspace`.
3. If no workspace: redirect to `/create-workspace`.
4. If has workspace: redirect to `/overview`.
5. Middleware protects `/overview` (requires session) and `/create-workspace` (requires session).

## 6. Server Components vs Client Components

- **Server Components** (default): Use for layouts, data fetching, pages.
- **Client Components** (`"use client"`): Use for interactive UI (forms, dropdowns, state).
- **Server Actions** (`"use server"`): Use for form submissions (login, signup, logout).

## 7. Sidebar Components

Sidebar components receive real data from the layout (server-side fetched):

- `AppSidebar` — accepts `currentUser` and `workspaces` props
- `WorkspaceSwitcher` — accepts `workspaces` array
- `NavUser` — accepts `user` object
- `AccountSwitcher` — accepts single `user` object

## 8. i18n

- Locale prefix via `[locale]` dynamic segment.
- Supported: `en`, `id`, `ja`.
- Translations in `dictionaries/<locale>.json`.

## 9. Environment Variables

All at root level, passed via `turbo.json` → `globalEnv`:

- `API_URL` — server-side API base URL
- `NEXT_PUBLIC_API_URL` — client-side API base URL
- `ENCRYPTION_KEY` — for API response decryption
- Supabase vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
