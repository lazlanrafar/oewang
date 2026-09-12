import { Env } from "@workspace/constants";
import { logger } from "@workspace/logger";
import { redis } from "@workspace/redis";
import { loadEnv } from "@workspace/utils/load-env";
import axios from "axios";

loadEnv();

/* =======================
   CONFIG
======================= */

const API_TOKEN = Env.CURRENCYFREAKS_API_KEY;
const API_URL = "https://api.currencyfreaks.com/v2.0/rates/latest";
const CACHE_KEY = "currency:rates:latest";
const ONE_DAY_SECONDS = 60 * 60 * 24;

/* =======================
   TYPES
======================= */

export interface CurrencyRatesResponse {
  date: string;
  base: string;
  rates: Record<string, string>;
}

export interface ConvertParams {
  amount: number;
  from: string;
  to: string;
}

export interface ConvertResult {
  from: string;
  to: string;
  amount: number;
  rate: number;
  converted_amount: number;
}

/* =======================
   FETCH & CACHE (CRON)
======================= */

export async function fetchAndCacheRates(): Promise<CurrencyRatesResponse> {
  if (!API_TOKEN) {
    throw new Error("Missing CURRENCYFREAKS_API_KEY in environment variables");
  }

  logger.info("[Currency] Fetching rates from API");

  let response: { data: CurrencyRatesResponse };
  try {
    response = await axios.get<CurrencyRatesResponse>(API_URL, {
      params: { apikey: API_TOKEN },
    });
  } catch (err: any) {
    const apiMessage =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err?.message ||
      "unknown";
    logger.error("[Currency] Failed to fetch rates from API", {
      apiMessage,
      status: err?.response?.status ?? "n/a",
    });
    throw new Error(`Currency rates API request failed: ${apiMessage}`);
  }

  if (!response.data?.rates) {
    throw new Error("Currency rates API returned no rates");
  }

  try {
    await redis.set(
      CACHE_KEY,
      JSON.stringify(response.data),
      "EX",
      ONE_DAY_SECONDS,
    );
    logger.info("[Currency] Cached rates in Redis", {
      count: Object.keys(response.data.rates).length,
    });
  } catch (err: any) {
    // Don't fail the whole request if caching fails — return live data anyway
    logger.warn("[Currency] Failed to cache rates in Redis", {
      error: err?.message,
    });
  }

  return response.data;
}

/* =======================
   GET RATES (CACHE FIRST)
======================= */

export async function getRates(): Promise<CurrencyRatesResponse> {
  const rawData = await redis.get(CACHE_KEY);

  if (rawData) {
    return JSON.parse(rawData) as CurrencyRatesResponse;
  }

  return fetchAndCacheRates();
}

/* =======================
   CONVERT UTILITY
======================= */

export async function convertCurrency(
  params: ConvertParams,
): Promise<ConvertResult> {
  const { amount, from, to } = params;

  if (amount <= 0) {
    throw new Error("Amount must be greater than 0");
  }

  const data = await getRates();

  const fromRate = Number(data.rates[from]);
  const toRate = Number(data.rates[to]);

  if (!fromRate || !toRate) {
    throw new Error(`Invalid currency code: ${!fromRate ? from : to}`);
  }

  // Cross-rate calculation (base USD assuming API returns rates relative to USD)
  const rate = toRate / fromRate;

  return {
    from,
    to,
    amount,
    rate,
    converted_amount: amount * rate,
  };
}
