"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";

export type AccordionItemData = {
  id: string;
  title: ReactNode;
  content: ReactNode;
  /** Pre-expanded on first render. */
  defaultOpen?: boolean;
};

export type AccordionProps = {
  items: AccordionItemData[];
  /** Multiple items open at once, vs. opening one closes the others. Default: multiple allowed. */
  singleOpen?: boolean;
  className?: string;
};

/**
 * Used for checkout steps' "why isn't this a native <details>?" — because
 * a single-open (mutually-exclusive) mode and a smooth height transition
 * both need JS; a plain <details> can't do either. Kept as the one
 * primitive in this file that needs "use client".
 */
export function Accordion({ items, singleOpen = false, className }: AccordionProps) {
  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(items.filter((item) => item.defaultOpen).map((item) => item.id)),
  );

  function toggle(id: string) {
    setOpenIds((current) => {
      const next = singleOpen ? new Set<string>() : new Set(current);
      if (current.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className={cn("divide-y divide-border", className)}>
      {items.map((item) => (
        <AccordionItem key={item.id} item={item} open={openIds.has(item.id)} onToggle={toggle} />
      ))}
    </div>
  );
}

function AccordionItem({
  item,
  open,
  onToggle,
}: {
  item: AccordionItemData;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const panelId = useId();

  return (
    <div>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(item.id)}
          className="flex w-full items-center justify-between gap-4 py-4 text-start text-body font-bold text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {item.title}
          <ChevronDown
            className={cn("size-4 shrink-0 text-accent transition-transform duration-200 ease-out", open && "rotate-180")}
            aria-hidden="true"
          />
        </button>
      </h3>
      <div
        id={panelId}
        role="region"
        className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <div className="pb-4 text-body-sm text-text-secondary">{item.content}</div>
        </div>
      </div>
    </div>
  );
}
