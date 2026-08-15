"use client";

import { useState } from "react";
import { Input } from "./ui";
import { KNOWN_BUYERS } from "@/lib/buyers";

export function BuyerInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const matches = KNOWN_BUYERS.filter((b) => b.includes(value.trim().toUpperCase()));

  return (
    <div className="relative">
      <Input
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="VD: NIKE"
        className="uppercase placeholder:normal-case"
        autoComplete="off"
      />
      {open && matches.length > 0 ? (
        <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg">
          {matches.map((b) => (
            <li key={b}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(b);
                  setOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-primary-soft hover:text-primary"
              >
                {b}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
