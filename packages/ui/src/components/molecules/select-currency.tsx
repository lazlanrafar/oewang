import { useMemo } from "react";
import { COUNTRIES } from "@workspace/constants";
import { Combobox } from "../atoms/combobox";

interface Currency {
  name: string;
  flag: string;
  currency: {
    code: string;
    symbol: string;
  } | null;
}

interface SelectCurrencyProps {
  value?: string;
  onSelect: (currency: {
    code: string;
    symbol: string;
    countryName: string;
  }) => void;
  className?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsMessage?: string;
  variant?: React.ComponentProps<typeof Combobox>["variant"];
  trigger?: React.ReactNode;
}

export function SelectCurrency({
  value,
  onSelect,
  className,
  placeholder = "Select currency...",
  searchPlaceholder = "Search currency...",
  noResultsMessage = "No currency found.",
  variant,
  trigger,
}: SelectCurrencyProps) {
  const items = useMemo(() => {
    return (COUNTRIES as Currency[])
      .filter((c) => c.currency !== null)
      .map((c) => ({
        id: c.currency!.code,
        label: `${c.currency!.code} - ${c.name} (${c.currency!.symbol})`,
        code: c.currency!.code,
        symbol: c.currency!.symbol,
        countryName: c.name,
        flag: c.flag,
      }));
  }, []);

  const selectedItem = items.find((item) => item.id === value);

  return (
    <Combobox
      items={items}
      selectedItem={selectedItem}
      onSelect={(item) =>
        onSelect({
          code: item.code,
          symbol: item.symbol,
          countryName: item.countryName,
        })
      }
      placeholder={placeholder}
      searchPlaceholder={searchPlaceholder}
      emptyResults={noResultsMessage}
      variant={variant}
      className={className}
      trigger={trigger}
      renderSelectedItem={(item: any) => (
        <div className="flex items-center space-x-2">
          <img
            src={item.flag}
            alt={`${item.countryName} flag`}
            className="h-3 w-4 rounded-sm object-cover shrink-0"
          />
          <span className="truncate">{item.label}</span>
        </div>
      )}
      renderListItem={({ item }: { item: any }) => (
        <div className="flex items-center space-x-2">
          <img
            src={item.flag}
            alt={`${item.countryName} flag`}
            className="h-3 w-4 rounded-sm object-cover shrink-0"
          />
          <span className="truncate text-xs font-medium">{item.label}</span>
        </div>
      )}
    />
  );
}
