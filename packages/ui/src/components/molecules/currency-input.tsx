import * as React from "react";

import { cn } from "../../lib/utils";
import { Input } from "../atoms/input";

interface CurrencyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "onChange"
> {
  value: number;
  onChange: (value: number) => void;
  currencySymbol?: string;
  decimalPlaces?: number;
}

export const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  CurrencyInputProps
>(
  (
    {
      value,
      onChange,
      currencySymbol = "$",
      decimalPlaces = 2,
      className,
      ...props
    },
    ref,
  ) => {
    const [displayValue, setDisplayValue] = React.useState("");

    React.useEffect(() => {
      const currentParsed = parseFloat(displayValue.replace(/[^0-9.-]/g, ""));
      if (value !== currentParsed && !isNaN(value)) {
        setDisplayValue(formatNumber(value));
      } else if (value === 0 && displayValue === "") {
        setDisplayValue("0");
      }
    }, [value]);

    const formatNumber = (num: number) => {
      return new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimalPlaces,
      }).format(num);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const inputValue = e.target.value;

      if (!/^[0-9.,-]*$/.test(inputValue)) return;

      const rawValue = inputValue.replace(/,/g, "");

      if (rawValue === "" || rawValue === "-" || rawValue === ".") {
        setDisplayValue(inputValue);
        onChange(0);
        return;
      }

      const numericValue = parseFloat(rawValue);

      if (!isNaN(numericValue)) {
        onChange(numericValue);

        const parts = rawValue.split(".");
        const integerPart = parts[0];
        const decimalPart = parts[1];

        const formattedInteger = integerPart
          ? parseInt(integerPart).toLocaleString("en-US")
          : "0";

        let newDisplay = formattedInteger;

        if (inputValue.includes(".")) {
          newDisplay += "." + (decimalPart || "");
        }

        if (rawValue.startsWith("-")) {
          newDisplay = "-" + newDisplay;
        }

        setDisplayValue(newDisplay);
      } else {
        setDisplayValue(inputValue);
      }
    };

    const handleBlur = () => {
      const rawValue = displayValue.replace(/,/g, "");
      const numericValue = parseFloat(rawValue);
      if (!isNaN(numericValue)) {
        setDisplayValue(
          new Intl.NumberFormat("en-US", {
            minimumFractionDigits: decimalPlaces,
            maximumFractionDigits: decimalPlaces,
          }).format(numericValue),
        );
      }
    };

    return (
      <Input
        {...props}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        ref={ref}
        className={cn("text-right font-mono", className)}
      />
    );
  },
);
CurrencyInput.displayName = "CurrencyInput";
