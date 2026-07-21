import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode
} from "react";
import { createPortal } from "react-dom";
import { Icon } from "./Icon";

export interface SelectOption<TValue extends string = string> {
  readonly value: TValue;
  readonly label: string;
  readonly disabled?: boolean;
}

interface SelectProps<TValue extends string> {
  readonly label: string;
  readonly value: TValue;
  readonly options: readonly SelectOption<TValue>[];
  readonly onChange: (value: TValue) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface MultiSelectProps<TValue extends string> {
  readonly label: string;
  readonly triggerLabel: string;
  readonly values: readonly TValue[];
  readonly options: readonly SelectOption<TValue>[];
  readonly onChange: (values: readonly TValue[]) => void;
  readonly clearLabel?: string;
  readonly disabled?: boolean;
  readonly className?: string;
}

interface OverlayPosition {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
}

type TooltipPlacement = "top" | "bottom" | "left" | "right";

interface TooltipPosition {
  readonly top: number;
  readonly left: number;
}

const MENU_MARGIN = 8;
const DEFAULT_MENU_HEIGHT = 232;
const TOOLTIP_GAP = 7;
const TOOLTIP_MARGIN = 6;

const optionText = <TValue extends string>(options: readonly SelectOption<TValue>[], value: TValue): string =>
  options.find((option) => option.value === value)?.label ?? "";

export const Select = <TValue extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  className
}: SelectProps<TValue>) => {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const listboxRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((option) => option.value === value))
  );
  const [position, setPosition] = useState<OverlayPosition | null>(null);
  const [typeahead, setTypeahead] = useState("");
  const typeaheadTimerRef = useRef<number | null>(null);
  const selectedLabel = optionText(options, value);

  const enabledOptions = useMemo(
    () => options.map((option, index) => ({ option, index })).filter((entry) => !entry.option.disabled),
    [options]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (triggerRef.current?.contains(target) || listboxRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const preferredWidth = Math.min(Math.max(rect.width, 176), viewportWidth - MENU_MARGIN * 2);
      const left = Math.min(Math.max(MENU_MARGIN, rect.left), viewportWidth - preferredWidth - MENU_MARGIN);
      const belowSpace = viewportHeight - rect.bottom - MENU_MARGIN;
      const aboveSpace = rect.top - MENU_MARGIN;
      const openAbove = belowSpace < 168 && aboveSpace > belowSpace;
      const maxHeight = Math.max(96, Math.min(DEFAULT_MENU_HEIGHT, openAbove ? aboveSpace : belowSpace));
      const top = openAbove ? Math.max(MENU_MARGIN, rect.top - maxHeight - 4) : rect.bottom + 4;
      setPosition({ top, left, width: preferredWidth, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
    setActiveIndex(selectedIndex);
    requestAnimationFrame(() => {
      document.getElementById(`${id}-option-${String(selectedIndex)}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [id, open, options, value]);

  useEffect(
    () => () => {
      if (typeaheadTimerRef.current !== null) {
        window.clearTimeout(typeaheadTimerRef.current);
      }
    },
    []
  );

  const moveActive = (direction: 1 | -1) => {
    if (enabledOptions.length === 0) {
      return;
    }
    const currentEnabledIndex = enabledOptions.findIndex((entry) => entry.index === activeIndex);
    const nextEnabledIndex =
      currentEnabledIndex < 0
        ? 0
        : (currentEnabledIndex + direction + enabledOptions.length) % enabledOptions.length;
    setActiveIndex(enabledOptions[nextEnabledIndex]?.index ?? 0);
  };

  const selectIndex = (index: number) => {
    const option = options[index];
    if (option.disabled) {
      return;
    }
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleTypeahead = (character: string) => {
    const nextQuery = `${typeahead}${character}`.toLowerCase();
    setTypeahead(nextQuery);
    if (typeaheadTimerRef.current !== null) {
      window.clearTimeout(typeaheadTimerRef.current);
    }
    typeaheadTimerRef.current = window.setTimeout(() => {
      setTypeahead("");
    }, 700);

    const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(nextQuery));
    if (match >= 0) {
      setActiveIndex(match);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          moveActive(1);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          moveActive(-1);
        }
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(enabledOptions[0]?.index ?? 0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(enabledOptions.at(-1)?.index ?? 0);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          selectIndex(activeIndex);
        }
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
      default:
        if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
          handleTypeahead(event.key);
        }
    }
  };

  return (
    <>
      <button
        aria-activedescendant={open ? `${id}-option-${String(activeIndex)}` : undefined}
        aria-controls={`${id}-listbox`}
        aria-disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={["ui-select-trigger", className].filter(Boolean).join(" ")}
        data-open={open}
        disabled={disabled}
        id={`${id}-trigger`}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span>{selectedLabel}</span>
        <span aria-hidden="true" className="ui-select-chevron"><Icon name="chevron-down" size={13} /></span>
      </button>
      {open && position
        ? createPortal(
            <div
              aria-label={label}
              className="ui-select-menu"
              id={`${id}-listbox`}
              onKeyDown={handleKeyDown}
              ref={listboxRef}
              role="listbox"
              style={{
                left: `${String(position.left)}px`,
                maxHeight: `${String(position.maxHeight)}px`,
                top: `${String(position.top)}px`,
                width: `${String(position.width)}px`
              }}
              tabIndex={-1}
            >
              {options.map((option, index) => (
                <button
                  aria-disabled={option.disabled}
                  aria-selected={option.value === value}
                  className="ui-select-option"
                  data-active={index === activeIndex}
                  disabled={option.disabled}
                  id={`${id}-option-${String(index)}`}
                  key={option.value}
                  onClick={() => {
                    selectIndex(index);
                  }}
                  role="option"
                  type="button"
                >
                  <span>{option.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export const MultiSelect = <TValue extends string>({
  label,
  triggerLabel,
  values,
  options,
  onChange,
  clearLabel = "Clear",
  disabled = false,
  className
}: MultiSelectProps<TValue>) => {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<OverlayPosition | null>(null);
  const selected = useMemo(() => new Set<TValue>(values), [values]);
  const enabledOptions = useMemo(
    () => options.map((option, index) => ({ option, index })).filter((entry) => !entry.option.disabled),
    [options]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const close = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Node &&
        (triggerRef.current?.contains(target) || menuRef.current?.contains(target))
      ) {
        return;
      }
      setOpen(false);
      triggerRef.current?.focus();
    };

    window.addEventListener("pointerdown", close);
    return () => {
      window.removeEventListener("pointerdown", close);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }

      const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const preferredWidth = Math.min(Math.max(rect.width, 188), viewportWidth - MENU_MARGIN * 2);
      const left = Math.min(Math.max(MENU_MARGIN, rect.left), viewportWidth - preferredWidth - MENU_MARGIN);
      const belowSpace = viewportHeight - rect.bottom - MENU_MARGIN;
      const aboveSpace = rect.top - MENU_MARGIN;
      const openAbove = belowSpace < 180 && aboveSpace > belowSpace;
      const maxHeight = Math.max(112, Math.min(DEFAULT_MENU_HEIGHT, openAbove ? aboveSpace : belowSpace));
      const top = openAbove ? Math.max(MENU_MARGIN, rect.top - maxHeight - 4) : rect.bottom + 4;
      setPosition({ top, left, width: preferredWidth, maxHeight });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    requestAnimationFrame(() => {
      document.getElementById(`${id}-option-${String(activeIndex)}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [activeIndex, id, open]);

  const moveActive = (direction: 1 | -1) => {
    if (enabledOptions.length === 0) {
      return;
    }
    const currentEnabledIndex = enabledOptions.findIndex((entry) => entry.index === activeIndex);
    const nextEnabledIndex =
      currentEnabledIndex < 0
        ? 0
        : (currentEnabledIndex + direction + enabledOptions.length) % enabledOptions.length;
    setActiveIndex(enabledOptions[nextEnabledIndex]?.index ?? 0);
  };

  const toggleValue = (value: TValue) => {
    const next = new Set(selected);
    if (next.has(value)) {
      next.delete(value);
    } else {
      next.add(value);
    }
    onChange(options.map((option) => option.value).filter((optionValue) => next.has(optionValue)));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement | HTMLDivElement>) => {
    if (disabled) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          moveActive(1);
        }
        break;
      case "ArrowUp":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          moveActive(-1);
        }
        break;
      case "Home":
        event.preventDefault();
        setActiveIndex(enabledOptions[0]?.index ?? 0);
        break;
      case "End":
        event.preventDefault();
        setActiveIndex(enabledOptions.at(-1)?.index ?? 0);
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          const option = options[activeIndex];
          if (!option.disabled) {
            toggleValue(option.value);
          }
        }
        break;
      case "Escape":
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        break;
    }
  };

  return (
    <>
      <button
        aria-activedescendant={open ? `${id}-option-${String(activeIndex)}` : undefined}
        aria-controls={`${id}-menu`}
        aria-disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={label}
        className={["ui-select-trigger ui-multiselect-trigger", className].filter(Boolean).join(" ")}
        data-open={open}
        disabled={disabled}
        id={`${id}-trigger`}
        onClick={() => {
          setOpen((current) => !current);
        }}
        onKeyDown={handleKeyDown}
        ref={triggerRef}
        role="combobox"
        type="button"
      >
        <span>{triggerLabel}</span>
        <span aria-hidden="true" className="ui-select-chevron"><Icon name="chevron-down" size={13} /></span>
      </button>
      {open && position
        ? createPortal(
            <div
              aria-label={label}
              aria-multiselectable="true"
              className="ui-select-menu ui-multiselect-menu"
              id={`${id}-menu`}
              onKeyDown={handleKeyDown}
              ref={menuRef}
              role="listbox"
              style={{
                left: `${String(position.left)}px`,
                maxHeight: `${String(position.maxHeight)}px`,
                top: `${String(position.top)}px`,
                width: `${String(position.width)}px`
              }}
              tabIndex={-1}
            >
              <button
                className="ui-multiselect-clear"
                disabled={values.length === 0}
                onClick={() => {
                  onChange([]);
                }}
                type="button"
              >
                {clearLabel}
              </button>
              {options.map((option, index) => (
                <button
                  aria-disabled={option.disabled}
                  aria-selected={selected.has(option.value)}
                  className="ui-select-option ui-multiselect-option"
                  data-active={index === activeIndex}
                  disabled={option.disabled}
                  id={`${id}-option-${String(index)}`}
                  key={option.value}
                  onClick={() => {
                    toggleValue(option.value);
                  }}
                  role="option"
                  type="button"
                >
                  <span aria-hidden="true" className="ui-multiselect-check">
                    {selected.has(option.value) ? <Icon name="check" size={11} /> : null}
                  </span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>,
            document.body
          )
        : null}
    </>
  );
};

export const SegmentedControl = <TValue extends string>({
  label,
  value,
  options,
  onChange
}: {
  readonly label: string;
  readonly value: TValue;
  readonly options: readonly SelectOption<TValue>[];
  readonly onChange: (value: TValue) => void;
}) => (
  <div aria-label={label} className="ui-segmented-control" role="radiogroup">
    {options.map((option) => (
      <button
        aria-checked={value === option.value}
        className="ui-segment"
        data-selected={value === option.value}
        disabled={option.disabled}
        key={option.value}
        onClick={() => {
          onChange(option.value);
        }}
        role="radio"
        type="button"
      >
        {option.label}
      </button>
    ))}
  </div>
);

export const Badge = ({
  children,
  tone = "neutral"
}: {
  readonly children: ReactNode;
  readonly tone?: "neutral" | "warning" | "critical" | "success";
}) => (
  <span className="ui-badge" data-tone={tone}>
    {children}
  </span>
);

export const EmptyState = ({ title, children }: { readonly title: string; readonly children?: ReactNode }) => (
  <div className="ui-empty-state">
    <strong>{title}</strong>
    {children ? <p>{children}</p> : null}
  </div>
);

export const Tooltip = ({
  children,
  content,
  placement = "top",
  delayMs = 350,
  disabled = false
}: {
  readonly children: ReactNode;
  readonly content: ReactNode;
  readonly placement?: TooltipPlacement;
  readonly delayMs?: number;
  readonly disabled?: boolean;
}) => {
  const id = useId();
  const anchorRef = useRef<HTMLSpanElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<TooltipPosition | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearTimer();
    setOpen(false);
  }, [clearTimer]);

  const scheduleOpen = () => {
    if (disabled) {
      return;
    }
    clearTimer();
    timerRef.current = window.setTimeout(() => {
      setOpen(true);
    }, delayMs);
  };

  useEffect(
    () => () => {
      clearTimer();
    },
    [clearTimer]
  );

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }

    const updatePosition = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current?.getBoundingClientRect();
      if (!anchor || !tooltip) {
        return;
      }

      const viewportWidth = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
      const viewportHeight = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
      const candidates: Record<TooltipPlacement, TooltipPosition> = {
        top: {
          top: anchor.top - tooltip.height - TOOLTIP_GAP,
          left: anchor.left + anchor.width / 2 - tooltip.width / 2
        },
        bottom: {
          top: anchor.bottom + TOOLTIP_GAP,
          left: anchor.left + anchor.width / 2 - tooltip.width / 2
        },
        left: {
          top: anchor.top + anchor.height / 2 - tooltip.height / 2,
          left: anchor.left - tooltip.width - TOOLTIP_GAP
        },
        right: {
          top: anchor.top + anchor.height / 2 - tooltip.height / 2,
          left: anchor.right + TOOLTIP_GAP
        }
      };
      const order: readonly TooltipPlacement[] =
        placement === "top"
          ? ["top", "bottom", "right", "left"]
          : placement === "bottom"
            ? ["bottom", "top", "right", "left"]
            : placement === "left"
              ? ["left", "right", "top", "bottom"]
              : ["right", "left", "top", "bottom"];
      const fits = (candidate: TooltipPosition) =>
        candidate.left >= TOOLTIP_MARGIN &&
        candidate.top >= TOOLTIP_MARGIN &&
        candidate.left + tooltip.width <= viewportWidth - TOOLTIP_MARGIN &&
        candidate.top + tooltip.height <= viewportHeight - TOOLTIP_MARGIN;
      const preferred = order.map((candidate) => candidates[candidate]).find(fits) ?? candidates[placement];
      setPosition({
        top: Math.min(Math.max(TOOLTIP_MARGIN, preferred.top), viewportHeight - tooltip.height - TOOLTIP_MARGIN),
        left: Math.min(Math.max(TOOLTIP_MARGIN, preferred.left), viewportWidth - tooltip.width - TOOLTIP_MARGIN)
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, placement]);

  return (
    <>
      <span
        aria-describedby={open ? id : undefined}
        className="ui-tooltip-anchor"
        onBlur={close}
        onFocus={scheduleOpen}
        onMouseEnter={scheduleOpen}
        onMouseLeave={close}
        onPointerEnter={scheduleOpen}
        onPointerLeave={close}
        ref={anchorRef}
      >
        {children}
      </span>
      {open
        ? createPortal(
            <div
              className="ui-tooltip"
              id={id}
              ref={tooltipRef}
              role="tooltip"
              style={{
                left: `${String(position?.left ?? -9999)}px`,
                top: `${String(position?.top ?? -9999)}px`
              }}
            >
              {content}
            </div>,
            document.body
          )
        : null}
    </>
  );
};
