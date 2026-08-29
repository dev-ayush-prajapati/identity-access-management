"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  LogOut,
  Moon,
  Search,
  Sun,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV_ICONS } from "@/components/shell/nav-icons";
import type { NavItem } from "@/components/shell/nav-items";

// Sign-out is the one command whose effect lives in the DOM (a hidden POST
// form) rather than in a callback. It's dispatched by id in runCommand instead
// of carrying a closure over the form ref, because anything the render path
// touches must stay ref-free.
const SIGN_OUT_ID = "action:sign-out";

interface Command {
  id: string;
  label: string;
  icon: LucideIcon;
  // Trailing muted text — current state, not a second name. Filtering never
  // looks at it, so it can't make a row match a word the user can't see.
  hint?: string;
  // Absent for commands handled by id — see SIGN_OUT_ID.
  run?: () => void;
}

interface CommandGroup {
  heading: string;
  items: Command[];
}

// Position in the flattened, post-filter list — the one thing the arrow keys
// walk, so it has to be assigned after filtering rather than per group.
type IndexedCommand = Command & { index: number };

const emptySubscribe = () => () => {};

// Same trap as components/theme-toggle.tsx: the resolved theme and the user's
// platform are both client-only facts, so branching on them during the first
// render would mismatch the server HTML. useSyncExternalStore's dual snapshots
// defer that branch to a post-hydration render.
function useHasMounted() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

function Kbd({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[0.65rem] leading-none text-muted-foreground",
        className
      )}
    >
      {children}
    </kbd>
  );
}

interface CommandPaletteProps {
  nav: NavItem[];
}

// Header search trigger plus the palette it opens. Both live in one component
// because the trigger is just another way to flip state the palette owns —
// splitting them would mean lifting `open` into the Server Component shell,
// which can't hold state at all.
//
// Props stay serializable (NavItem carries a string icon name); the lucide
// component is resolved here via NAV_ICONS, same as SidebarNav.
export function CommandPalette({ nav }: CommandPaletteProps) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const hasMounted = useHasMounted();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);

  const listRef = useRef<HTMLDivElement>(null);
  const signOutRef = useRef<HTMLFormElement>(null);
  const listId = useId();

  const isDark = hasMounted && resolvedTheme === "dark";
  const isMac = hasMounted && /Mac|iP(hone|ad|od)/.test(navigator.userAgent);

  const groups = useMemo<CommandGroup[]>(
    () => [
      {
        heading: "Go to",
        items: [
          ...nav.map((item) => ({
            id: `nav:${item.href}`,
            label: item.label,
            icon: NAV_ICONS[item.icon],
            run: () => router.push(item.href),
          })),
          // Profile isn't in any zone's nav — it's the one page every tier
          // shares — but it's exactly what people reach for in a palette.
          {
            id: "nav:/profile",
            label: "Profile",
            icon: UserRound,
            run: () => router.push("/profile"),
          },
        ],
      },
      {
        heading: "Actions",
        items: [
          {
            id: "action:theme",
            label: "Toggle theme",
            icon: isDark ? Sun : Moon,
            hint: isDark ? "Dark" : "Light",
            run: () => setTheme(isDark ? "light" : "dark"),
          },
          {
            id: SIGN_OUT_ID,
            label: "Sign out",
            icon: LogOut,
          },
        ],
      },
    ],
    [nav, router, isDark, setTheme]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result: { heading: string; items: IndexedCommand[] }[] = [];
    let index = 0;

    for (const group of groups) {
      const items = needle
        ? group.items.filter((item) => item.label.toLowerCase().includes(needle))
        : group.items;
      if (items.length === 0) continue;
      result.push({
        heading: group.heading,
        items: items.map((item) => ({ ...item, index: index++ })),
      });
    }
    return result;
  }, [groups, query]);

  const flat = useMemo(() => filtered.flatMap((group) => group.items), [filtered]);

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      // Ctrl+K is the browser's own search-bar shortcut in Firefox, so the
      // chord has to be claimed explicitly or the palette never sees it.
      event.preventDefault();
      setOpen((prev) => !prev);
      setQuery("");
      setSelected(0);
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  // Keyboard selection has to drag the viewport with it, or holding ArrowDown
  // walks the highlight straight off the bottom of the scroll box.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected, open]);

  function handleOpenChange(next: boolean) {
    if (next) {
      setQuery("");
      setSelected(0);
    }
    setOpen(next);
  }

  function runCommand(command: Command) {
    // Event handler, so reading the ref here is safe — and keeping the read on
    // this side of the render boundary is what lets the command list itself
    // stay free of refs. Submits the hidden POST form below; Auth.js's client
    // signOut() would only drop the local cookie and leave the Keycloak SSO
    // session alive, so the next login would silently re-authenticate.
    if (command.id === SIGN_OUT_ID) {
      signOutRef.current?.requestSubmit();
    } else {
      command.run?.();
    }
    setOpen(false);
  }

  // Escape and the backdrop are handled by the Dialog itself — only the list
  // navigation is ours. Both ends wrap so a held arrow key never dead-ends.
  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (flat.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((prev) => (prev + 1) % flat.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((prev) => (prev - 1 + flat.length) % flat.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const command = flat[selected];
      if (command) runCommand(command);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Search"
        aria-keyshortcuts="Meta+K Control+K"
        onClick={() => handleOpenChange(true)}
        className="flex h-8 shrink-0 items-center gap-2 rounded-lg border border-input px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:w-44 sm:justify-between sm:px-2.5 lg:w-56"
      >
        <span className="flex items-center gap-2">
          <Search className="size-4 shrink-0" aria-hidden />
          <span className="hidden sm:inline">Search...</span>
        </span>
        <Kbd className="hidden sm:inline-flex">{isMac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>

      {/* POST-only, same as components/auth/sign-out-form.tsx: SameSite=Lax
          then keeps a cross-site page from triggering a sign-out. */}
      <form ref={signOutRef} action="/api/auth/federated-signout" method="post" className="hidden" />

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          showCloseButton={false}
          className="top-[12vh] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogTitle className="sr-only">Command palette</DialogTitle>

          <div className="flex items-center gap-2.5 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search pages and actions..."
              aria-label="Search pages and actions"
              role="combobox"
              aria-expanded
              aria-controls={listId}
              aria-activedescendant={flat[selected] ? `${listId}-${selected}` : undefined}
              autoComplete="off"
              spellCheck={false}
              className="h-11 rounded-none border-0 bg-transparent px-0 text-sm focus-visible:border-transparent focus-visible:ring-0 dark:bg-transparent"
            />
          </div>

          <div
            ref={listRef}
            id={listId}
            role="listbox"
            aria-label="Commands"
            className="max-h-[min(22rem,50vh)] overflow-y-auto p-2"
          >
            {flat.length === 0 && (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                No matches for “{query.trim()}”
              </p>
            )}

            {filtered.map((group) => (
              <div key={group.heading} role="group" aria-label={group.heading} className="pb-1">
                <p
                  aria-hidden
                  className="px-2 py-1.5 font-mono text-[0.65rem] tracking-wider text-muted-foreground uppercase"
                >
                  {group.heading}
                </p>
                {group.items.map((command) => {
                  const Icon = command.icon;
                  const isSelected = command.index === selected;

                  return (
                    <div
                      key={command.id}
                      id={`${listId}-${command.index}`}
                      role="option"
                      aria-selected={isSelected}
                      data-selected={isSelected}
                      // Hover drives the same state as the arrow keys, so the
                      // pointer and the keyboard can never highlight two
                      // different rows. Guarded to skip no-op renders.
                      onMouseMove={() => {
                        if (!isSelected) setSelected(command.index);
                      }}
                      // Keep focus in the input: a blur here would strand the
                      // combobox before the click even resolves.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => runCommand(command)}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors",
                        isSelected ? "bg-accent text-accent-foreground" : "text-foreground"
                      )}
                    >
                      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      <span className="truncate">{command.label}</span>
                      {command.hint && (
                        <span className="ml-auto shrink-0 font-mono text-[0.7rem] text-muted-foreground">
                          {command.hint}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/40 px-3 py-2 text-[0.7rem] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              Navigate
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              Select
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>Esc</Kbd>
              Close
            </span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
