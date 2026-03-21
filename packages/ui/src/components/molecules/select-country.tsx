import { useMemo } from "react";
import { COUNTRIES } from "@workspace/constants";
import { Combobox } from "../atoms/combobox";

interface Country {
  name: string;
  flag: string;
}

interface SelectCountryProps {
  value?: string;
  onSelect: (countryName: string) => void;
  className?: string;
  placeholder?: string;
  variant?: React.ComponentProps<typeof Combobox>["variant"];
}

export function SelectCountry({
  value,
  onSelect,
  className,
  placeholder = "Select country...",
  variant,
}: SelectCountryProps) {
  const items = useMemo(() => {
    return (COUNTRIES as Country[]).map((c) => ({
      id: c.name,
      label: c.name,
      flag: c.flag,
    }));
  }, []);

  const selectedItem = items.find((item) => item.id === value);

  return (
    <Combobox
      items={items}
      selectedItem={selectedItem}
      onSelect={(item) => onSelect(item.id)}
      placeholder={placeholder}
      searchPlaceholder="Search country..."
      variant={variant}
      className={className}
      renderSelectedItem={(item: any) => (
        <div className="flex items-center space-x-2">
          <img
            src={item.flag}
            alt={`${item.label} flag`}
            className="h-3 w-4 rounded-sm object-cover shrink-0"
          />
          <span className="truncate">{item.label}</span>
        </div>
      )}
      renderListItem={({ item }: { item: any }) => (
        <div className="flex items-center space-x-2">
          <img
            src={item.flag}
            alt={`${item.label} flag`}
            className="h-3 w-4 rounded-sm object-cover shrink-0"
          />
          <span className="truncate">{item.label}</span>
        </div>
      )}
    />
  );
}
