"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";

import { CommandList } from "cmdk";
import { Button } from "./button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "./command";
import { Popover, PopoverContent, PopoverTrigger } from "./popover";
import { cn } from "../../lib/utils";

export type ComboboxItem = {
  id: string;
  label: string;
  disabled?: boolean;
};

type Props<T> = {
  placeholder?: React.ReactNode;
  searchPlaceholder?: string;
  items: T[];
  onSelect: (item: T) => void;
  selectedItem?: T;
  selectedItems?: T[];
  multiple?: boolean;
  renderSelectedItem?: (selectedItem: T | T[]) => React.ReactNode;
  renderListItem?: (listItem: {
    isChecked: boolean;
    item: T;
  }) => React.ReactNode;
  renderOnCreate?: (value: string) => React.ReactNode;
  emptyResults?: React.ReactNode;
  popoverProps?: React.ComponentProps<typeof PopoverContent>;
  disabled?: boolean;
  onCreate?: (value: string) => void;
  headless?: boolean;
  className?: string;
  triggerClassName?: string;
  modal?: boolean;
  variant?: React.ComponentProps<typeof Button>["variant"];
  trigger?: React.ReactNode;
  showChevron?: boolean;
};

export function Combobox<T extends ComboboxItem>({
  headless,
  placeholder,
  searchPlaceholder,
  items,
  onSelect,
  selectedItem: incomingSelectedItem,
  selectedItems: incomingSelectedItems,
  multiple,
  renderSelectedItem = (item) =>
    Array.isArray(item) ? item.map((i) => i.label).join(", ") : item.label,
  renderListItem,
  renderOnCreate,
  emptyResults,
  popoverProps,
  disabled,
  onCreate,
  className,
  triggerClassName,
  modal = false,
  variant = "outline",
  trigger,
  showChevron = true,
}: Props<T>) {
  const [open, setOpen] = React.useState(false);
  const [internalSelectedItem, setInternalSelectedItem] = React.useState<
    T | undefined
  >();
  const [internalSelectedItems, setInternalSelectedItems] = React.useState<T[]>(
    [],
  );
  const [inputValue, setInputValue] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const selectedItem = incomingSelectedItem ?? internalSelectedItem;
  const selectedItems = incomingSelectedItems ?? internalSelectedItems;

  React.useEffect(() => {
    if (open) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  }, [open]);

  const filteredItems = items.filter((item) =>
    item.label.toLowerCase().includes(inputValue.toLowerCase()),
  );

  const showCreate =
    onCreate && Boolean(inputValue) && filteredItems.length === 0;

  const searchContent = React.useMemo(() => (
    <Command loop shouldFilter={false}>
      <CommandInput
        ref={inputRef}
        autoFocus
        value={inputValue}
        onValueChange={setInputValue}
        placeholder={searchPlaceholder ?? "Search item..."}
        className="px-3"
      />

      <CommandList
        className="max-h-[300px] overflow-y-auto overflow-x-hidden"
        onWheel={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <CommandEmpty>{emptyResults ?? "No item found"}</CommandEmpty>
        <CommandGroup>
          {filteredItems.map((item) => {
            const isChecked = multiple
              ? selectedItems.some((i) => i.id === item.id)
              : selectedItem?.id === item.id;

            return (
              <CommandItem
                disabled={item.disabled}
                className={cn("cursor-pointer", className)}
                key={item.id}
                value={item.id}
                onSelect={(id) => {
                  const foundItem = items.find((item) => item.id === id);

                  if (!foundItem) {
                    return;
                  }

                  if (multiple) {
                    onSelect(foundItem);
                    const isAlreadySelected = selectedItems.some(
                      (i) => i.id === foundItem.id,
                    );
                    if (isAlreadySelected) {
                      setInternalSelectedItems(
                        selectedItems.filter((i) => i.id !== foundItem.id),
                      );
                    } else {
                      setInternalSelectedItems([...selectedItems, foundItem]);
                    }
                  } else {
                    onSelect(foundItem);
                    setInternalSelectedItem(foundItem);
                    setOpen(false);
                    setInputValue("");
                  }
                }}
              >
                {renderListItem ? (
                  renderListItem({ isChecked, item })
                ) : (
                  <>
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        isChecked ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {item.label}
                  </>
                )}
              </CommandItem>
            );
          })}

          {showCreate && (
            <CommandItem
              key={`create-${inputValue}`}
              value={`create-${inputValue}`}
              onSelect={() => {
                onCreate(inputValue);
                setOpen(false);
                setInputValue("");
              }}
              onMouseDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
              }}
            >
              {renderOnCreate ? renderOnCreate(inputValue) : null}
            </CommandItem>
          )}
        </CommandGroup>
      </CommandList>
    </Command>
  ), [
    inputValue,
    filteredItems,
    searchPlaceholder,
    emptyResults,
    multiple,
    selectedItems,
    selectedItem,
    className,
    items,
    onSelect,
    renderListItem,
    showCreate,
    onCreate,
    renderOnCreate,
  ]);

  if (headless) {
    return searchContent;
  }

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen) => {
        setOpen(isOpen);
        if (!isOpen) {
          setInputValue("");
        }
      }}
      modal={modal}
    >
      <PopoverTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button
            variant={variant}
            aria-expanded={open}
            className={cn(
              "w-full justify-between relative font-normal",
              triggerClassName,
            )}
          >
            <span className="truncate text-ellipsis pr-3">
              {multiple ? (
                selectedItems.length > 0 ? (
                  <span className="items-center overflow-hidden whitespace-nowrap text-ellipsis block">
                    {renderSelectedItem
                      ? renderSelectedItem(selectedItems)
                      : null}
                  </span>
                ) : (
                  (placeholder ?? "Select items...")
                )
              ) : selectedItem ? (
                <span className="items-center overflow-hidden whitespace-nowrap text-ellipsis block">
                  {renderSelectedItem
                    ? renderSelectedItem(selectedItem)
                    : selectedItem.label}
                </span>
              ) : (
                (placeholder ?? "Select item...")
              )}
            </span>
            {showChevron && (
              <ChevronsUpDown className="size-4 opacity-50 absolute right-2" />
            )}
          </Button>
        )}
      </PopoverTrigger>

      <PopoverContent
        {...popoverProps}
        portal={popoverProps?.portal ?? false}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className={cn("p-0 min-w-50 pointer-events-auto", popoverProps?.className)}
        style={{
          width: "var(--radix-popover-trigger-width)",
          ...popoverProps?.style,
        }}
      >
        {searchContent}
      </PopoverContent>
    </Popover>
  );
}
