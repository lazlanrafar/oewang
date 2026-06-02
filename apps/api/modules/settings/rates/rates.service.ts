import { convertCurrency, getRates } from "@workspace/currencyfreaks";
import { ErrorCode } from "@workspace/types";
import { buildError, buildSuccess } from "@workspace/utils";
import { status } from "elysia";

export abstract class RatesService {
  static async getExchangeRates(base: string = "USD") {
    const rates = await getRates();

    // If base is USD, we can return rates directly
    if (base === "USD") {
      return buildSuccess(rates.rates, "Exchange rates retrieved successfully");
    }

    const baseRate = Number(rates.rates[base]);
    if (!baseRate) {
      throw status(
        400,
        buildError(
          ErrorCode.VALIDATION_ERROR,
          `Invalid base currency: ${base}`,
        ),
      );
    }

    const recalculatedRates: Record<string, string> = {};
    for (const [code, rateStr] of Object.entries(rates.rates)) {
      const rate = Number(rateStr);
      recalculatedRates[code] = (rate / baseRate).toString();
    }

    return buildSuccess(
      recalculatedRates,
      "Exchange rates retrieved successfully",
    );
  }

  static async convertCurrency(amount: string, from: string, to: string) {
    const result = await convertCurrency({
      amount: Number(amount),
      from,
      to,
    });
    return buildSuccess(result, "Currency converted successfully");
  }
}
