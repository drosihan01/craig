"use client";

import * as React from "react";
import { PERSONAL_DETAILS_EXTRAS_FIELD } from "@/lib/craig/contract";
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
import { logActivity, useShowcase } from "@/lib/craig/store";

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
 * The seat itself is the route's to create, not this component's. It used to
 * write a second copy of the person into the browser's store as well, and that
 * copy was the bug: the new starter's progress and the admin's removals both
 * happen on the server, so a browser list of invitees could only ever be a
 * stale second answer to "who has a seat". `onInvited` fires instead, and the
 * caller re-reads the server — which is also why the caller is told only after
 * the send succeeds. A row that appeared before the email landed would still be
 * there when it didn't, and "invited" would quietly come to mean "we tried".
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

/**
 * The block config keys that describe a *run* rather than the admin's answers.
 *
 * Everything else a block holds is either working notes or a value only the
 * editor renders, and copying it onto a person would put settings nobody
 * consults into a record about them. These two are read by the invite route,
 * which allowlists the same pair again on its own side — a client is not a
 * place to enforce anything.
 */
function pickRunConfig(
  config: Record<string, string | string[]> | undefined,
): Record<string, string | string[]> | undefined {
  if (!config) return undefined;

  const picked: Record<string, string | string[]> = {};
  if (config["require-mfa"]) picked["require-mfa"] = config["require-mfa"];
  if (Array.isArray(config[PERSONAL_DETAILS_EXTRAS_FIELD])) {
    picked[PERSONAL_DETAILS_EXTRAS_FIELD] = config[PERSONAL_DETAILS_EXTRAS_FIELD];
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
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
  /* Set only by the route's 409, never guessed at here. The offer to send
     again is the route's to make: it is the side that knows a seat exists for
     this address on *this* account, and a client that decided for itself would
     be offering to re-send somebody else's invitation on a stale list. */
  const [canResend, setCanResend] = React.useState(false);

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
    setCanResend(false);
  }

  function close() {
    if (sending) return;
    reset();
    onClose();
  }

  /**
   * @param resend Send this person's link again rather than creating a seat.
   *   Only ever passed by the button the route's 409 puts on screen, and the
   *   route asks for it by name — so an admin who simply presses Invite twice
   *   gets the refusal, not a silent second email.
   */
  async function send({ resend = false }: { resend?: boolean } = {}) {
    if (!ready || sending || !start) return;

    setSending(true);
    setError(null);
    setCanResend(false);

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
          resend,
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
            /* Two keys, not the config. The rule above still holds — a
               request about a person has no use for the addresses and
               templates a block collects — but these two are different in
               kind: `require-mfa` changes what "done" means for a step Craig
               runs, and the extras multiselect changes which fields the new
               starter is shown. Both describe the run rather than the admin's
               working notes, so both travel. The route allowlists the same two
               keys rather than trusting whatever arrives. */
            config: pickRunConfig(b.config),
          })),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        ok?: boolean;
        id?: string;
        error?: string;
        resend?: boolean;
      } | null;

      if (!response.ok || !payload?.ok || !payload.id) {
        setError(
          payload?.error ??
            "The invitation didn't send. Nothing was sent twice.",
        );
        setCanResend(payload?.resend === true);
        return;
      }

      /* The ledger, and nothing else. This is the account's record of what it
         did, it is the one part of an invitation that isn't already on the
         server, and an invite is the most consequential line it will ever
         carry — so it is written here, where the send is known to have
         succeeded, rather than lost along with the seat list that used to be
         kept beside it. */
      logActivity(
        resend
          ? {
              verb: "Sent again",
              what: `${person.name}'s invitation — their answers were kept`,
            }
          : {
              verb: "Invited",
              what: `${person.name} and sent their first step`,
            },
      );
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
          {/* Wrapped rather than passed by reference: `send` now takes options,
              and handing it straight to `onClick` would feed it a MouseEvent
              as its options object. */}
          <Button
            size="sm"
            onClick={() => void send()}
            disabled={!ready}
            loading={sending}
          >
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
          <Callout
            tone={canResend ? "warning" : "danger"}
            icon={<Warning />}
            title={canResend ? "They already have a seat" : "It didn't send"}
          >
            {error}
            {canResend && (
              <div className="mt-3">
                {/* The way out of the dead end this used to be. Before this
                    button the only route to a second email was deleting the
                    seat and inviting again, which threw away every answer the
                    new starter had already given — so the admin whose hire
                    said "I never got it" had to choose between chasing them
                    and keeping their work. */}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={sending}
                  onClick={() => void send({ resend: true })}
                >
                  {sending ? "Sending…" : "Send their link again"}
                </Button>
                <p className="mt-2 text-sm opacity-80">
                  A fresh link to the same onboarding. Nothing they have
                  already filled in is touched.
                </p>
              </div>
            )}
          </Callout>
        )}
      </div>
    </Dialog>
  );
}
