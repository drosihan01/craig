"use client";

import * as React from "react";
import {
  Button,
  NotificationBell,
  NotificationList,
  ToastProvider,
  useToast,
  type AppNotification,
} from "@/components/ui";

const mins = (n: number) => new Date(Date.now() - n * 60_000);

const SEED: AppNotification[] = [
  {
    id: "n1",
    kind: "approval",
    title: "Jason needs to sign off on prod access",
    description: "Blocks the last step of the engineer workflow",
    timestamp: mins(4),
    actor: "Jason Cho",
  },
  {
    id: "n2",
    kind: "overdue",
    title: "The handbook hasn\u2019t been reviewed since Feb 2026",
    description: "Two steps in the engineer workflow point at it",
    timestamp: mins(90),
  },
  {
    id: "n3",
    kind: "complete",
    title: "IT completed “Order laptop and store login”",
    timestamp: mins(60 * 5),
    actor: "Tom Walsh",
    read: true,
  },
  {
    id: "n4",
    kind: "assigned",
    title: "You were assigned 2 steps",
    description: "Laptop order and the handbook refresh",
    timestamp: mins(60 * 26),
    read: true,
  },
];

export function NotificationDemo() {
  const [items, setItems] = React.useState(SEED);

  const markAllRead = () =>
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  const markRead = (id: string) =>
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));

  return (
    <div className="flex w-full flex-col gap-5">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
          <span className="text-sm text-text-muted">In the header:</span>
          <NotificationBell
            items={items}
            onSelect={markRead}
            onMarkAllRead={markAllRead}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setItems(SEED)}>
          Reset
        </Button>
      </div>

      <div className="w-full max-w-md overflow-hidden rounded-lg border border-border bg-surface-raised">
        <NotificationList
          items={items}
          onSelect={markRead}
          onMarkAllRead={markAllRead}
        />
      </div>
    </div>
  );
}

export function ToastDemo() {
  return (
    <ToastProvider>
      <ToastButtons />
    </ToastProvider>
  );
}

function ToastButtons() {
  const { toast } = useToast();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        onClick={() =>
          toast({
            tone: "success",
            title: "Workflow published",
            description: "New starters in this role will be assigned it.",
          })
        }
      >
        Success
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          toast({
            title: "Step duplicated",
            action: { label: "Undo", onClick: () => {} },
          })
        }
      >
        With an action
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          toast({
            tone: "warning",
            title: "3 steps have no owner",
            description: "They'll fall to People & Culture.",
          })
        }
      >
        Warning
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() =>
          toast({
            tone: "danger",
            title: "Couldn't publish",
            description: "One block is still unconfigured.",
            duration: 0,
          })
        }
      >
        Danger (sticky)
      </Button>
    </div>
  );
}
