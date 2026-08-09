"use client";

import * as React from "react";
import {
  Button,
  ChatModal,
  DEFAULT_MODEL,
  Dialog,
  ModelPicker,
  type ChatMessage,
  type ChatModel,
} from "@/components/ui";
import { AutoAwesome, Forum } from "@/components/ui/icons";

/* A canned reply per model, streamed a token at a time. Stands in for the
   real endpoint so the modal's streaming, stop and scroll behaviour can be
   exercised without a backend. */
const REPLIES: Record<string, string> = {
  craigopilot:
    "Six of nine steps are outstanding, and five of them are owned by Jason. The Slack channel list still has no owner at all — it's the only step nobody can action. The handbook step points at a doc last updated in Feb 2026, which two other steps also reference. Want me to flag both to Jason?",
  claude:
    "The critical path runs through Jason: keys, the who-owns-what walkthrough and the prod sign-off are all his, and the last one blocks day one. With three people that's a single point of failure rather than a queue — worth deciding now what happens if he's away that week.",
  gpt: "There are 6 open steps, mostly assigned to Jason Cho. The Slack channels step is unassigned. I'd suggest giving it an owner and refreshing the handbook.",
};

export function ChatDemo() {
  const [open, setOpen] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [model, setModel] = React.useState<ChatModel>(DEFAULT_MODEL);
  const timers = React.useRef<number[]>([]);

  const clearTimers = React.useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  React.useEffect(() => clearTimers, [clearTimers]);

  function send(text: string, m: ChatModel) {
    const userId = crypto.randomUUID();
    const replyId = crypto.randomUUID();

    setMessages((prev) => [
      ...prev,
      { id: userId, role: "user", content: text },
      {
        id: replyId,
        role: "assistant",
        content: "",
        streaming: true,
        model: m.name,
      },
    ]);
    setBusy(true);

    const words = (REPLIES[m.id] ?? REPLIES.claude).split(" ");
    words.forEach((_, i) => {
      const t = window.setTimeout(
        () => {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === replyId
                ? { ...msg, content: words.slice(0, i + 1).join(" ") }
                : msg,
            ),
          );
          if (i === words.length - 1) {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === replyId ? { ...msg, streaming: false } : msg,
              ),
            );
            setBusy(false);
          }
        },
        260 + i * 28,
      );
      timers.current.push(t);
    });
  }

  function stop() {
    clearTimers();
    setBusy(false);
    setMessages((prev) =>
      prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)),
    );
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <AutoAwesome />
        Ask Craig
      </Button>
      <Button
        variant="secondary"
        onClick={() => {
          clearTimers();
          setMessages([]);
          setBusy(false);
          setOpen(true);
        }}
      >
        <Forum />
        Open empty
      </Button>

      <ChatModal
        open={open}
        onClose={() => setOpen(false)}
        messages={messages}
        onSend={send}
        onStop={stop}
        busy={busy}
        model={model}
        onModelChange={setModel}
        suggestions={[
          "what's still outstanding for the new hire?",
          "draft a step for the slack channels",
          "which steps are blocked, and on whom?",
        ]}
      />
    </>
  );
}

export function ModelPickerDemo() {
  const [model, setModel] = React.useState<ChatModel>(DEFAULT_MODEL);
  return (
    <div className="flex items-center gap-3">
      {/* The list opens upward — it lives above a composer in real use. */}
      <div className="pt-32">
        <ModelPicker value={model} onChange={setModel} />
      </div>
      <span className="text-sm text-text-subtle">
        selected: <span className="text-text">{model.name}</span>
      </span>
    </div>
  );
}

export function DialogDemo() {
  const [open, setOpen] = React.useState(false);
  const [confirm, setConfirm] = React.useState(false);

  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Open dialog
      </Button>
      <Button variant="danger" onClick={() => setConfirm(true)}>
        Delete workflow
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Publish workflow"
        description="Retail team member — VIC"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(false)}>Publish</Button>
          </>
        }
      >
        <div className="px-5 py-4 text-base text-text-muted">
          <p>
            Once published, every new starter assigned to this role gets this
            workflow automatically. Existing starters keep the version they were
            assigned.
          </p>
        </div>
      </Dialog>

      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        title="Delete this workflow?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => setConfirm(false)}>
              Delete
            </Button>
          </>
        }
      >
        <div className="px-5 py-4 text-base text-text-muted">
          <p>
            34 starters are part-way through it. They&apos;ll keep their copy,
            but no one new will be assigned. This can&apos;t be undone.
          </p>
        </div>
      </Dialog>
    </>
  );
}
