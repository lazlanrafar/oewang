import {
  Combobox,
  Spinner,
  cn,
} from "@workspace/ui";
import { COUNTRIES } from "@workspace/constants";
import { useMemo } from "react";

export interface CurrencySelectorProps {
  value?: string;
  onChange: (currency: string) => void;
  onSelect?: () => void;
  className?: string;
  headless?: boolean;
  variant?: "default" | "ghost";
}

export interface SelectCurrencyProps {
  value?: string;
  onChange: (currency: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  headless?: boolean;
  hideLoading?: boolean;
  variant?: "default" | "ghost";
}

export function CurrencySelector({
  value,
  onChange,
  onSelect,
  className,
  headless = true,
  variant,
}: CurrencySelectorProps) {
  const currencies = useMemo(() => {
    const uniqueCurrencies = new Map<
      string,
      { code: string; symbol: string }
    >();
    for (const country of COUNTRIES) {
      if (country.currency) {
        uniqueCurrencies.set(country.currency.code, country.currency);
      }
    }
    return Array.from(uniqueCurrencies.values()).sort((a, b) =>
      a.code.localeCompare(b.code),
    );
  }, []);

  const items = currencies.map((c) => ({
    id: c.code,
    label: `${c.code} (${c.symbol})`,
    code: c.code,
    symbol: c.symbol,
  }));

  const selectedCurrency = items.find((i) => i.id === value);

  return (
    <Combobox
      headless={headless}
      items={items}
      selectedItem={selectedCurrency}
      onSelect={(item) => {
        onChange(item.code);
        onSelect?.();
      }}
      placeholder="Select currency"
      searchPlaceholder="Search currencies..."
      className={className}
      variant={variant}
      renderSelectedItem={(item) => (
        <span className="font-medium uppercase tracking-wider">
          {item.code} ({item.symbol})
        </span>
      )}
      renderListItem={({ item }) => (
        <span className="font-medium">
          {item.code} ({item.symbol})
        </span>
      )}
    />
  );
}

export function SelectCurrency({
  value,
  onChange,
  className,
  disabled,
  placeholder = "Select currency",
  headless,
  hideLoading,
  variant,
}: SelectCurrencyProps) {
  // Return early if loading pattern is needed, though currency data is static
  // But to be consistent with other molecules:
  if (!value && hideLoading === false && false) { // currencies are static, so no real loading
     // skip for now as COUNTRIES is static
  }

  return (
    <CurrencySelector
      value={value}
      onChange={onChange}
      className={className}
      headless={headless}
      variant={variant}
    />
  );
}
