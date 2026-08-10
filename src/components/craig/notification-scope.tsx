"use client";

import * as React from "react";
import type { AppNotification } from "@/components/ui";

/**
 * The bell's contents, provided once for every screen under `(app)`.
 *
 * The alternative was every page fetching its own and passing it into its own
 * `AppShell` — five screens writing out the same four queries, and the fifth
 * being where somebody passes a stale entitlement and the bell quietly
 * disagrees with the page it is sitting on. The layout already runs everywhere
 * and already knows who is reading, which makes it the one place that can
 * answer this once.
 *
 * It is also the only place that can answer it *correctly*, because the answer
 * depends on which kind of person is here. `/me` runs on the same shell as the
 * admin's screens, and the admin's list is about seats, billing and other
 * people's broken steps — none of which is a new starter's business. The layout
 * picks the list from the session it already resolved, so a joiner cannot be
 * handed the employer's by any route through the app.
 *
 * A context rather than a prop for the same reason `AccountScope` is one: the
 * thing that knows is a server layout, the thing that renders is a client
 * component several levels down, and threading it through every screen in
 * between is a change to every screen in between.
 */

const NotificationContext = React.createContext<AppNotification[]>([]);

/**
 * A request to open the bell, from somewhere that is not the bell.
 *
 * Home's "2 more" needs to open the panel in the shell's header, which is a
 * sibling several levels up. The alternatives were worse: lifting the bell's
 * open state into `AppShell` and threading a setter down to every screen, or
 * having Home find the button in the DOM and click it — the second of which
 * works until somebody changes an `aria-label`.
 *
 * A counter rather than a boolean, because the interesting event is *asked
 * again*: pressing "2 more", closing the panel and pressing it again has to
 * reopen it, and a boolean that is already `true` says nothing the second time.
 */
const OpenRequestContext = React.createContext<{
  requests: number;
  open: () => void;
}>({ requests: 0, open: () => {} });

export function NotificationScope({
  items,
  children,
}: {
  items: AppNotification[];
  children: React.ReactNode;
}) {
  /* Serialised across the boundary as plain objects; `timestamp` is optional
     and these carry none, so nothing needs reviving into a Date. */
  const value = React.useMemo(() => items, [items]);

  const [requests, setRequests] = React.useState(0);
  const opener = React.useMemo(
    () => ({ requests, open: () => setRequests((n) => n + 1) }),
    [requests],
  );

  return (
    <NotificationContext.Provider value={value}>
      <OpenRequestContext.Provider value={opener}>
        {children}
      </OpenRequestContext.Provider>
    </NotificationContext.Provider>
  );
}

/** Ask the shell's bell to open. */
export function useOpenNotifications() {
  return React.useContext(OpenRequestContext).open;
}

/** The bell's own subscription: a number that changes when somebody asks. */
export function useNotificationOpenRequests() {
  return React.useContext(OpenRequestContext).requests;
}

/**
 * What the shell should show, unless a screen says otherwise.
 *
 * `AppShell` still takes a `notifications` prop and it still wins — the design
 * system and the mailmaker pass their own, and a screen with a genuinely
 * different list should be able to say so. This is the default underneath.
 */
export function useNotifications(): AppNotification[] {
  return React.useContext(NotificationContext);
}
