import axios from "axios";
import { redis } from "@workspace/redis";
import { loadEnv } from "@workspace/utils/load-env";
import { Env } from "@workspace/constants";

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

  console.log("[Currency] Fetching rates from API");

  const response = await axios.get<CurrencyRatesResponse>(API_URL, {
    params: { apikey: API_TOKEN },
  });

  await redis.set(CACHE_KEY, response.data, {
    ex: ONE_DAY_SECONDS,
  });

  console.log("[Currency] Rates cached in Redis");

  return response.data;
}

/* =======================
   GET RATES (CACHE FIRST)
======================= */

export async function getRates(): Promise<CurrencyRatesResponse> {
  const cached = await redis.get<CurrencyRatesResponse>(CACHE_KEY);

  if (cached) {
    return cached;
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
