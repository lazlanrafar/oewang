import { getMe, getTransactionSettings } from "@workspace/modules/server";
import { cache } from "react";

// Per-render deduplication: layout and page render in the same server pass and
// each call these — React cache() collapses them into one API request. This is
// request-scoped only; cross-request caching happens in the API's Redis layer.
export const getMeCached = cache(getMe);
export const getTransactionSettingsCached = cache(getTransactionSettings);
