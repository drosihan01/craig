"use client";

import * as React from "react";
import {
  Badge,
  Button,
  Callout,
  DatePicker,
  Dialog,
  Field,
  Input,
  Select,
  toISODate,
} from "@/components/ui";
import { CheckCircle, Mail, Warning } from "@/components/ui/icons";
import { invitePerson, useShowcase } from "@/lib/showcase/store";

/**
 * The first thing in this product that reaches somebody else.
 *
 * Four fields, no wizard: whoever is filling this in already knows all four,
 * and spreading them over three screens is how a two-minute job becomes a job
 * for next week. Nothing is pre-filled, because nothing here is invented —
 * every name on this account was typed by the person holding it.
 *
 * The panel above the buttons is the part that matters. Pressing this sends
 * real mail to a real person under the company's name, and it cannot be
 * unsent — so the dialog says exactly what will happen instead of asking
 * whether they're sure.
 *
 * The store is only written after the send succeeds. A row that appears in
 * People before the email lands is a row that will still be there when it
 * didn't, and "invited" would quietly come to mean "we tried".
 */

const ENDPOINT = "/api/showcase/invite";

export interface InvitedPerson {
  name: string;
  email: string;
  role: string;
  /** `YYYY-MM-DD`. */
  startDate: string;
  /** The provider's id for the message that went out, for looking it up. */
  messageId: string;
}

export function InviteStarter({
  open,
  onClose,
  workflowId,
  onInvited,
  justPublished = false,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * Whether this opened off the back of pressing Publish.
   *
   * The dialog is the same either way, but arriving at it is not. From People
   * you came here on purpose and the screen needs no preamble. From Publish
   * you pressed a button that said Publish and got a form asking for somebody's
   * name — so it has to say what happened to the thing you actually pressed,
   * or the form reads as though the publish didn't take.
   *
   * A prop rather than something read from the workflow, because `published`
   * is true for the rest of the workflow's life and this is only true for the
   * few seconds after it changed.
   */
  justPublished?: boolean;
  /** Which workflow they're being put through. */
  workflowId: string;
  onInvited?: (person: InvitedPerson) => void;
}) {
  const { workflows } = useShowcase();

  /**
   * Which workflow they're being put through, chosen here rather than assumed.
   *
   * A seat exists because somebody was invited, and an invitation exists to
   * start a particular plan — so the plan is part of the invitation and not a
   * detail settled elsewhere. Before this the screen picked whichever workflow
   * happened to be published first, which is fine while there is one and
   * silently wrong the day there are two: the second hire goes through the
   * first hire's onboarding and nothing on screen ever said so.
   *
   * Only published ones. A draft can be selected in the sense that a form
   * would accept it, and then nothing runs.
   */
  const publishable = workflows.filter((w) => w.published);
  const [chosenId, setChosenId] = React.useState(workflowId);
  const workflow = publishable.find((w) => w.id === chosenId) ?? null;

  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState("");
  const [start, setStart] = React.useState<Date | null>(null);
  const [sending, setSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  /* Deliberately weaker than the route's check, and only used to decide whether
     the button is worth pressing. Two rulesets that both get to refuse an
     address is two rulesets that will one day disagree about a real one, so the
     server owns the rule and this owns the affordance. */
  const ready =
    name.trim() !== "" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) &&
    !!start &&
    /* No workflow, no invitation. Sending one anyway would give somebody a
       seat with nothing behind it — an email promising a checklist, and an
       empty page when they open it. */
    !!workflow;

  function reset() {
    setName("");
    setEmail("");
    setRole("");
    setStart(null);
    setError(null);
  }

  function close() {
    if (sending) return;
    reset();
    onClose();
  }

  async function send() {
    if (!ready || sending || !start) return;

    setSending(true);
    setError(null);

    const startDate = toISODate(start);
    const person = {
      name: name.trim(),
      email: email.trim(),
      role: role.trim(),
      startDate,
    };

    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...person,
          workflowId: workflow?.id,
          workflowName: workflow?.name,
          /* The steps go with the invitation, because the server has no way to
             read them otherwise — a workflow lives in this browser and the
             person being invited will open theirs somewhere else entirely.
             What's sent is a snapshot: their onboarding is fixed at the moment
             they're asked, so editing the workflow next week doesn't rewrite
             the half they haven't done yet.

             Only the four fields the server uses. Sending whole blocks would
             put every field value the admin typed — names, addresses, whatever
             a step collects — into a request that has no use for them. */
          blocks: (workflow?.blocks ?? []).map((b) => ({
            id: b.id,
            kind: b.kind,
            title: b.title,
            preset: b.preset,
            due: b.due,
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        id?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.ok || !payload.id) {
        setError(
          payload?.error ??
            "The invitation didn't send. Nothing was sent twice.",
        );
        return;
      }

      invitePerson({
        ...person,
        role: person.role || "Not set",
        startDate,
        invitedAt: new Date().toISOString(),
      });
      onInvited?.({ ...person, messageId: payload.id });
      reset();
      onClose();
    } catch {
      /* No response at all — offline, or the tab lost the network mid-request.
         Said carefully: the request may well have reached the server, so the
         one thing this must not do is invite them to press it again. */
      setError(
        "Couldn't reach the server, so it's not clear whether that went out. Check People before sending it again.",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="Invite someone"
      description={
        /* The name moves out of here when the line above is carrying it.
           Saying it twice in two stacked sentences reads like a template that
           didn't know what it had already said. */
        justPublished
          ? "They get a seat, and it starts running against them."
          : workflow
            ? `They get a seat, and ${workflow.name} starts running against it.`
            : "They get a seat, and their workflow starts running against it."
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={close} disabled={sending}>
            Cancel
          </Button>
          <Button size="sm" onClick={send} disabled={!ready} loading={sending}>
            {sending ? "Sending" : "Send invite"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5 px-5 py-5">
        {/* Deliberately a line rather than a panel. It's an acknowledgement of
            the button you just pressed, and giving it a bordered box of its own
            would make the first thing in the dialog a notice to be dismissed
            rather than a sentence to be read on the way to the fields. */}
        {justPublished && (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <Badge tone="success" size="sm">
              <CheckCircle />
              Published
            </Badge>
            <p className="text-base text-text-muted">
              <span className="font-medium text-text">
                {workflow ? workflow.name : "Your workflow"}
              </span>{" "}
              is live. Now give it someone to run.
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Their name"
            />
          </Field>

          {/* Personal, not the work address. Their company account usually
              doesn't exist until somebody in this workflow creates it, and an
              invitation sent to a mailbox that onboarding creates is an
              invitation nobody reads. */}
          <Field
            label="Email"
            hint="Somewhere they can read today — their work address may not exist yet."
          >
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
            />
          </Field>

          <Field label="Role" hint="Shown to whoever owns a step.">
            <Input
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="What they're joining as"
            />
          </Field>

          <Field label="Start date" hint="The date the email will give them.">
            <DatePicker value={start} onChange={setStart} />
          </Field>

          {/* Full width, and last, because it's the one field that decides what
              the other four are for. */}
          <Field
            label="Workflow"
            hint="What they'll be put through. Only published ones can start."
            className="sm:col-span-2"
          >
            <Select
              value={chosenId}
              onChange={(e) => setChosenId(e.target.value)}
            >
              {/* Shown even when there's only one, and shown even when it
                  arrives already chosen. The caller knows which workflow you
                  came from — you just published it, or it's the one running —
                  so starting there saves a click that has no alternative. What
                  it must not do is decide invisibly: the field is on screen,
                  it names what they'll be put through, and it can be changed.

                  The empty option stays for the case the caller's workflow
                  isn't publishable, where the honest state is that nothing is
                  selected and Send is shut. */}
              <option value="">Choose a workflow</option>
              {publishable.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-surface-sunken p-3">
          <Mail className="mt-0.5 size-4 shrink-0 text-text-subtle" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="text-base">
              <span className="font-medium">One email</span>{" "}
              <span className="text-text-muted">
                goes to {email.trim() || "them"} the moment you press this.
              </span>
            </p>
            <p className="text-sm text-text-muted">
              Everything after it waits for the step it belongs to. Nobody else
              hears from Craig today.
            </p>
          </div>
        </div>

        {error && (
          <Callout tone="danger" icon={<Warning />} title="It didn't send">
            {error}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
