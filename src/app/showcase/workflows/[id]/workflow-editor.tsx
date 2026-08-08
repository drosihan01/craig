"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InviteStarter } from "@/components/showcase/invite-starter";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/showcase/showcase-nav";
import {
  AppShell,
  BackLink,
  Badge,
  BlockInspector,
  BlockSetup,
  Button,
  Dialog,
  EmptyState,
  Field,
  Input,
  Select,
  Separator,
  Textarea,
  WorkflowBuilder,
  WorkflowCanvas,
  revealDuration,
  buttonVariants,
  isUnconfigured,
  setupWarning,
  type WorkflowBlock,
} from "@/components/ui";
import {
  AltRoute,
  AutoAwesome,
  Check,
  ChevronLeft,
  Delete,
} from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import { SeatPaywall, outOfSeats } from "@/components/showcase/seat-paywall";
import { WorkflowCraig } from "@/components/showcase/workflow-craig";
import type { Session } from "@/lib/showcase/contract";
import {
  deleteWorkflow,
  markRevealed,
  publishWorkflow,
  setWorkflowBlocks,
  stepCount,
  unconfiguredCount,
  useShowcase,
  type ShowcaseWorkflow,
} from "@/lib/showcase/store";
import { useCraigChat } from "@/lib/showcase/use-craig-chat";
import {
  DUE_OPTIONS,
  blockFromPreset,
  findPreset,
} from "@/lib/workflow/library";
import type { BlockPreset } from "@/lib/workflow/library";

/**
 * Where Craig's draft lands.
 *
 * The conversation ends with a workflow and, until this screen existed, that
 * was where it stopped — he could tell you what he'd built but there was
 * nowhere to look at it. So this is the second half of the argument the welcome
 * screen makes: he does the writing, you do the deciding, and the decisions he
 * couldn't make are marked on the steps they belong to rather than listed in a
 * paragraph you have to translate back into work.
 *
 * One rule runs the whole page. A step is unconfigured when a required field of
 * its preset has no value, and that single derivation badges the block on the
 * canvas, fills the worklist in the left column and disables Publish. Nothing
 * is stored, nothing is counted twice, and the three surfaces cannot disagree
 * about how finished this is.
 *
 * The right column is him, still talking. The conversation that produced this
 * draft carries on here — same thread, same store — and what he says now edits
 * the canvas rather than describing what he would edit. He is held in `Editor`
 * rather than in the panel because selecting a block replaces the panel with
 * that block's settings, and a conversation that unmounts mid-answer is a
 * conversation you have to start again.
 */

/** Every step is somebody's, and the most common somebody is the person arriving. */
const NEW_STARTER = "The new hire";

/**
 * Why Craig can't run this step himself, if he can't.
 *
 * A preset marked unavailable is still a real part of onboarding — cloud access
 * deliberately keeps a person in the loop, Notion's API can't manage members —
 * so it belongs in the workflow as work somebody does. It is not a gap to be
 * closed, and it must never be drawn as one.
 */
const byHand = (block: WorkflowBlock) =>
  block.preset ? findPreset(block.preset)?.unavailable : undefined;

let seq = 0;
const nextId = () => `b${Date.now()}-${seq++}`;

export function WorkflowEditor({
  id,
  user,
  seats,
}: {
  id: string;
  user: Session;
  /**
   * Everyone holding a seat on this account, by name, read on the server.
   *
   * One prop for two questions, because they are the same question. Craig's
   * panel wants the count — has this workflow actually run against anybody —
   * and the step inspector wants the names, to offer as owners. A list and a
   * separate number would be two things to keep in step, and the number is the
   * one that used to be wrong: it came from the browser's own copy of the
   * invitees, which never heard about a seat taken back on the server.
   */
  seats: string[];
}) {
  const { workflows } = useShowcase();
  const router = useRouter();
  const workflow = workflows.find((w) => w.id === id);

  /* Both the confirmation and the delete itself live out here rather than in
     `Editor`, because `Editor` is the thing being deleted. A component cannot
     own the state that decides whether it still exists. */
  const [confirming, setConfirming] = React.useState(false);
  const [leaving, setLeaving] = React.useState(false);

  function remove() {
    if (!workflow) return;
    /* `leaving` is set in the same batch as the store write, and it has to be:
       removing the workflow re-renders this component with nothing to find, and
       the branch below would show the "no such workflow" screen. Deleting one
       on purpose would flash an error at you on the way out. */
    setLeaving(true);
    deleteWorkflow(workflow.id);
    router.push("/showcase/workflows");
  }

  if (!workflow) return leaving ? null : <NoWorkflow user={user} />;

  return (
    <>
      <Editor
        /* Keyed so opening a different workflow starts with nothing selected,
           rather than carrying a block id that belongs to the last one. */
        key={workflow.id}
        workflow={workflow}
        user={user}
        seats={seats}
        onDelete={() => setConfirming(true)}
      />
      <ConfirmDelete
        open={confirming}
        workflow={workflow}
        onCancel={() => setConfirming(false)}
        onConfirm={remove}
      />
    </>
  );
}

/**
 * The one screen in here that asks whether you're sure.
 *
 * Everywhere else this product states what will happen instead of asking —
 * the invite dialog says an email goes out the moment you press it, and that's
 * better than a confirmation, because a warning you can read is worth more than
 * a button you can click twice. This is the exception, and it earns it by being
 * the only action with nothing to undo it: there is no draft history and no
 * restore, so the workflow is simply gone.
 *
 * The published case gets its own sentence. Deleting a draft loses work;
 * deleting a published workflow also stops something that is currently running
 * the company's onboarding, and those are not the same decision.
 */
function ConfirmDelete({
  open,
  workflow,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  workflow: ShowcaseWorkflow;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const steps = stepCount(workflow.blocks);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      /* Not `sm`. The title carries the workflow's name and the body has two
         sentences to say, and 24rem wraps a four-word name onto three lines. */
      size="md"
      title={`Delete ${workflow.name}?`}
      description="This can't be undone."
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={onConfirm}>
            Delete workflow
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3 px-5 py-5">
        <p className="text-base leading-relaxed text-text-muted">
          {steps === 0
            ? "There are no steps in it yet."
            : `Its ${steps} ${steps === 1 ? "step goes" : "steps go"} with it.`}{" "}
          {workflow.published
            ? "It's published, so nobody given a seat from now on will be put through it."
            : "It was never published, so nothing has run against it."}
        </p>

        {/* Said plainly, because the opposite is what people brace for. Anybody
            already part-way through this workflow is a real person at the
            company, and tidying up a plan is not a reason for them to vanish
            from the account. */}
        <p className="text-sm leading-relaxed text-text-subtle">
          Everyone already invited keeps their seat and stays in People.
        </p>
      </div>
    </Dialog>
  );
}

function Editor({
  workflow,
  user,
  seats,
  onDelete,
}: {
  workflow: ShowcaseWorkflow;
  user: Session;
  /** Everyone holding a seat, by name, from the server. */
  seats: string[];
  onDelete: () => void;
}) {
  const blocks = workflow.blocks;

  /* Given the workflow's id, so his turns carry it and his editing tools have
     something to edit. Held here, above the panel that renders him. */
  const chat = useCraigChat(workflow.id);

  /* Only to re-read the seats after an invitation goes out. They arrived as
     props from the server, so the page that read them is the only thing that
     can update them — and Craig's panel still saying nobody has been given a
     seat, on the screen you just invited somebody from, would be the same
     staleness this prop exists to end. */
  const router = useRouter();

  /* Straight through to the store rather than into local state. A copy here
     would mean an answer given on this screen never reaching the list that
     counts what's still open. */
  const setBlocks = React.useCallback(
    (next: WorkflowBlock[] | ((prev: WorkflowBlock[]) => WorkflowBlock[])) =>
      setWorkflowBlocks(
        workflow.id,
        typeof next === "function" ? next(workflow.blocks) : next,
      ),
    [workflow.id, workflow.blocks],
  );

  /* Opens on the workflow, not on a step. Landing inside one block's settings
     before you've seen the shape of the thing is backwards. */
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const selected = blocks.find((b) => b.id === selectedId) ?? null;

  /**
   * Whether this is the first time anybody has looked at it.
   *
   * Read once, into state, rather than off the workflow on every render — the
   * effect below marks it seen immediately, and a reveal driven by the store
   * value would be cancelled by its own bookkeeping a frame after it started.
   */
  const [revealing, setRevealing] = React.useState(() => !workflow.revealedAt);

  /* The blocks there were when this opened, captured once. The reveal is about
     those and only those — adding a step by hand ten minutes later must not
     re-arm a timer that says Craig is still laying it out. */
  const [revealCount] = React.useState(workflow.blocks.length);
  const revealTimerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    markRevealed(workflow.id);
    /* Ends the line in Craig's panel. The blocks need no timer — their
       entrance is CSS and finishes on its own — but a phase that says he's
       laying it out has to stop being true at some point. */
    revealTimerRef.current = window.setTimeout(
      () => setRevealing(false),
      /* Asked rather than guessed. This was a hardcoded ceiling with a comment
         conceding a long workflow would outrun it — so the line saying he's
         laying it out could stop while blocks were still landing. The builder
         owns the timing and now says how long it needs. */
      revealDuration(revealCount),
    );
    const timer = revealTimerRef.current;
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [workflow.id, revealCount]);

  /* Anything you do to the workflow ends the reveal. An animation you have to
     wait out is worse than no animation, so touching a block stops it dead
     rather than playing on underneath what you're now reading. */
  function select(id: string | null) {
    setSelectedId(id);
    if (id) setRevealing(false);
  }

  /**
   * Everyone a step can be assigned to.
   *
   * The account holder, anybody holding a seat, the person arriving — and
   * every name already written onto the draft. That last part is what makes
   * the list honest: Craig learned about Jason in the conversation and this
   * account has never met him, so a list built only from the seats would render
   * an owner that is very much set as "Not set".
   */
  const assignees = React.useMemo(() => {
    const names = [user.name, ...seats, NEW_STARTER];

    for (const block of blocks) {
      if (block.owner) names.push(block.owner);
      const preset = block.preset ? findPreset(block.preset) : undefined;
      for (const field of preset?.setup ?? []) {
        if (field.kind !== "person") continue;
        const value = block.config?.[field.id];
        if (typeof value === "string" && value.trim()) names.push(value);
      }
    }

    return [...new Set(names)];
  }, [user.name, seats, blocks]);

  function insert(preset: BlockPreset, index: number) {
    const block = blockFromPreset(preset, nextId());
    setBlocks((prev) => [...prev.slice(0, index), block, ...prev.slice(index)]);
    select(block.id);
  }

  function remove(id: string) {
    setBlocks((prev) => prev.filter((b) => b.id !== id));
    setRevealing(false);
    setSelectedId((cur) => (cur === id ? null : cur));
  }

  function duplicate(id: string) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      if (i === -1) return prev;
      const copy = {
        ...prev[i],
        id: nextId(),
        title: `${prev[i].title} (copy)`,
      };
      return [...prev.slice(0, i + 1), copy, ...prev.slice(i + 1)];
    });
  }

  function move(id: string, direction: -1 | 1) {
    setBlocks((prev) => {
      const i = prev.findIndex((b) => b.id === id);
      const j = i + direction;
      // Index 0 is the trigger and is not a valid destination.
      if (i < 1 || j < 1 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  /**
   * What dragging a block by its grip does, which `move` can't express: a
   * drag crosses as many steps as it likes in one gesture, and swapping with
   * your neighbour doesn't generalise to that.
   *
   * `to` is the index the block should occupy afterwards, so it is lifted out
   * first and put back second — splicing it in while it is still in the array
   * is where every off-by-one in a reorder comes from.
   *
   * The guards restate the builder's rule rather than trusting it. Index 0 is
   * the trigger, and this is the last point at which a workflow can be stopped
   * from being stored with something above it.
   */
  function reorder(id: string, to: number) {
    setBlocks((prev) => {
      const from = prev.findIndex((b) => b.id === id);
      if (from < 1 || to < 1 || to >= prev.length || to === from) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function patch(id: string, changes: Partial<WorkflowBlock>) {
    setBlocks((prev) =>
      prev.map((b) => (b.id === id ? { ...b, ...changes } : b)),
    );
  }

  const steps = stepCount(blocks);
  const unconfigured = unconfiguredCount(blocks);

  const [inviting, setInviting] = React.useState(false);
  const [paywall, setPaywall] = React.useState(false);

  function publish() {
    publishWorkflow(workflow.id);
    /* Back to Craig, because what happens next is written in his panel and a
       block's settings would be sitting on top of it. */
    select(null);
    /* Straight into the invite. A published workflow that nobody is on does
       nothing, and the next thing you want is never "look at it again" — so
       the dialog opens rather than waiting to be found. Dismissing it leaves
       the workflow published and the button on People, which is the same
       act one screen later.

       Unless there is no seat to put anybody in, in which case the price comes
       first. This is the same rule People applies to the same button, asked of
       the same server count — publishing must not be a way round a limit that
       the other screen enforces, and finding that out after typing somebody's
       name and address would be a worse place to hear it. The workflow stays
       published either way: it is live and waiting, which is exactly what the
       paywall says happens if you decline. */
    if (outOfSeats(seats.length)) setPaywall(true);
    else setInviting(true);
  }

  return (
    <AppShell
      title={workflow.name}
      account={{ name: user.name, email: user.email }}
      fill
      /* Wider than the default, and remembered separately. This panel holds
         Craig's side of the conversation that wrote the workflow, not a list
         of counts, and a transcript in 224px wraps every other line. */
      asidePanel={{ key: "builder", width: 320 }}
      /* Only while Craig has the panel. His transcript starts at the top rule
         and scrolls under it; a block's settings below still want the margin. */
      asideFlushTop={!selected}
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          <EditorNav
            workflow={workflow}
            blocks={blocks}
            steps={steps}
            unconfigured={unconfigured}
            onSelect={select}
            onDelete={onDelete}
          />
        </ShowcaseNav>
      }
      actions={
        workflow.published ? (
          <Badge tone="success">
            <Check />
            Published
          </Badge>
        ) : (
          /* A trigger on its own is valid but pointless, so an empty workflow
             is unpublishable for a different reason to an unconfigured one. */
          <Button
            size="sm"
            disabled={unconfigured > 0 || steps === 0}
            onClick={publish}
          >
            Publish
          </Button>
        )
      }
      aside={
        /* One thing at a time, and no heading over it. With nothing selected
           the panel is Craig — he wrote this and he's the reason to look right.
           Select a block and it becomes that block's settings. */
        selected ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => select(null)}
              className="-ml-1 flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-xs text-text-subtle transition-colors hover:bg-surface-hover hover:text-text"
            >
              <ChevronLeft className="size-3.5" />
              Back to Craig
            </button>

            <BlockInspector block={selected}>
              {/* The trigger has nothing to edit. It's the same block in every
                  workflow and it fires on one event — offering a title field
                  for it would imply otherwise. */}
              {selected.kind === "trigger" ? (
                <p className="text-sm leading-relaxed text-text-subtle">
                  No configuration. This step is identical in every workflow.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <ByHandNote reason={byHand(selected)} />

                  <Separator />
                  <Field label="Title">
                    <Input
                      value={selected.title}
                      onChange={(e) =>
                        patch(selected.id, { title: e.target.value })
                      }
                    />
                  </Field>

                  <Field label="Summary" hint="Shown on the block">
                    <Textarea
                      rows={2}
                      value={selected.summary ?? ""}
                      onChange={(e) =>
                        patch(selected.id, { summary: e.target.value })
                      }
                    />
                  </Field>

                  {/* Relative to the person, because the workflow is a
                      template — the same plan run for the next hire has to
                      produce different dates without anybody editing it. The
                      real date appears on their page, where there is a start
                      date to count from. */}
                  <Field
                    label="Due"
                    hint="Counted from their first day. Their page shows the date."
                  >
                    <Select
                      value={selected.due ?? ""}
                      onChange={(e) =>
                        patch(selected.id, {
                          /* Back to `undefined`, not `0`. No deadline and
                             "due on day one" are different claims, and an
                             empty select that saved as day one would put a
                             date on every step somebody cleared. */
                          due:
                            e.target.value === ""
                              ? undefined
                              : Number(e.target.value),
                        })
                      }
                    >
                      <option value="">No date</option>
                      {DUE_OPTIONS.map((o) => (
                        <option key={o.days} value={o.days}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {/* What this particular step needs before it can run. The
                      fields come from the preset, so a GitHub block asks for an
                      org and a permission level and a contract block asks for a
                      document and a countersigner. */}
                  {selected.preset && (
                    <>
                      <Separator />
                      <BlockSetup
                        block={selected}
                        people={assignees}
                        onChange={(fieldId, value) =>
                          patch(selected.id, {
                            config: { ...selected.config, [fieldId]: value },
                          })
                        }
                      />
                    </>
                  )}

                  {selected.incomplete && (
                    <>
                      <Separator />
                      <Field
                        label="Flagged"
                        hint="Left open rather than guessed at"
                      >
                        <div className="flex flex-col gap-2">
                          <p className="text-sm text-text-muted">
                            {selected.incomplete}
                          </p>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="w-fit"
                            onClick={() =>
                              patch(selected.id, { incomplete: undefined })
                            }
                          >
                            Resolved
                          </Button>
                        </div>
                      </Field>
                    </>
                  )}
                </div>
              )}
            </BlockInspector>
          </div>
        ) : (
          <WorkflowCraig
            chat={chat}
            blocks={blocks}
            revealing={revealing}
            published={workflow.published}
            seats={seats.length}
          />
        )
      }
    >
      {/* Full bleed. The canvas is the page — a title and a paragraph above it
          would repeat the header and steal the space the work needs. The
          negative margins cancel the content column's padding. */}
      <div className="-mx-4 h-[calc(100vh-3rem)] lg:-mx-8">
        <WorkflowCanvas
          className="h-full rounded-none border-0"
          onBackgroundClick={() => select(null)}
        >
          <div className="px-10 py-12">
            <WorkflowBuilder
              blocks={blocks}
              reveal={revealing}
              selectedId={selectedId}
              onSelect={select}
              onInsert={insert}
              onRemove={remove}
              onDuplicate={duplicate}
              onMove={move}
              onReorder={reorder}
            />
          </div>
        </WorkflowCanvas>
      </div>
      <InviteStarter
        open={inviting}
        onClose={() => setInviting(false)}
        workflowId={workflow.id}
        justPublished
        onInvited={() => router.refresh()}
      />

      {/* The same dialog People opens, for the same reason and with the same
          number in it. Written once and used twice rather than a second
          version of the offer here, because two paywalls are two chances to
          quote a different price to the same person. */}
      <SeatPaywall
        open={paywall}
        onClose={() => setPaywall(false)}
        holder={seats[0]}
      />
    </AppShell>
  );
}

/**
 * A step Craig can't run, said plainly and without alarm.
 *
 * The distinction this draws is the one that decides whether somebody trusts
 * the rest of the screen: a warning badge means "you have to fix this", and
 * "cloud access keeps a human in the loop" is not something anybody can fix. So
 * it reads as a fact about the step, in the same quiet frame the preset's own
 * fixed behaviour uses, and the reason is printed as written rather than folded
 * into a sentence it doesn't grammatically fit.
 */
function ByHandNote({ reason }: { reason?: string }) {
  if (!reason) return null;

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border-strong px-3 py-2">
      <p className="text-xs leading-relaxed text-text-muted">
        A step somebody does themselves, not one Craig runs.
      </p>
      <p className="text-xs leading-relaxed text-text-subtle">{reason}</p>
    </div>
  );
}

/**
 * The menu column, which here is everything true about the workflow you're in.
 *
 * The list of open steps is the useful part: four unanswered steps out of
 * twelve is the actual state of the draft, and each row jumps to its block, so
 * it's a worklist rather than a summary you read and then go hunting from.
 */
function EditorNav({
  workflow,
  blocks,
  steps,
  unconfigured,
  onSelect,
  onDelete,
}: {
  workflow: ShowcaseWorkflow;
  blocks: WorkflowBlock[];
  steps: number;
  unconfigured: number;
  onSelect: (id: string) => void;
  onDelete: () => void;
}) {
  const open = blocks.filter(isUnconfigured);
  const manual = blocks.filter((b) => byHand(b)).length;

  return (
    <div className="flex flex-col gap-5">
      <BackLink href="/showcase/workflows" className="px-2">
        Workflows
      </BackLink>

      <Separator />

      <div className="flex flex-col gap-3 px-2">
        {/* No name here — the header carries it, and the trigger is the first
            block on the canvas. A column that repeats what's already on screen
            twice over is a column you stop reading. */}
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Overview
        </p>

        <div className="flex flex-col gap-2">
          <NavStat label="Steps" value={steps} />
          <NavStat
            label="Unconfigured"
            value={unconfigured}
            tone={unconfigured > 0 ? "warning" : "neutral"}
          />
          {/* Only when there are some. A permanent "0 done by hand" would make
              a normal workflow look like it was missing something. */}
          {manual > 0 && <NavStat label="Done by hand" value={manual} />}
        </div>

        <div className="flex flex-col gap-1 pt-1">
          <NavFact label="Drafted by" value={workflow.draftedBy ?? "You"} />
          <NavFact
            label="Status"
            value={workflow.published ? "Published" : "Draft"}
          />
        </div>
      </div>

      {open.length > 0 && (
        <>
          <Separator />
          <div className="flex flex-col gap-1.5 px-2">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              Still open
            </p>
            {open.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => onSelect(b.id)}
                className="-mx-1.5 flex flex-col gap-0.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="text-sm leading-snug text-text-muted">
                  {b.title}
                </span>
                <span className="text-2xs leading-relaxed text-text-subtle">
                  {setupWarning(b)}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        {workflow.published
          ? "Published. Everyone given a seat from now on starts at step one and works down."
          : "A workflow cannot be published while any step is unconfigured."}
      </p>

      {/* Last in the column and nowhere near Publish. The two live at opposite
          ends of the screen on purpose — they are the two irreversible things
          you can do here, and putting them within a thumb's width of each
          other is how one gets done instead of the other. A quiet link rather
          than a red button, because the confirmation is where the weight
          belongs; a danger button sitting in the furniture all day stops
          reading as a warning. */}
      <button
        type="button"
        onClick={onDelete}
        /* `mx-0.5 px-1.5` rather than the `-mx-1.5` the worklist buttons use.
           Those sit inside a `px-2` wrapper and pull back out of it; this is a
           direct child of the column, so the same trick would hang it a step
           left of every other line in here. 2px of margin plus 6px of padding
           puts the label on the same 8px as its siblings, and leaves the hover
           fill wider than the text. */
        className="mx-0.5 mt-1 flex items-center gap-1.5 self-start rounded-md px-1.5 py-1 text-xs text-text-subtle transition-colors hover:bg-danger-subtle hover:text-danger"
      >
        <Delete className="size-3.5" />
        Delete workflow
      </button>
    </div>
  );
}

/** A label and a value on one line. Not a NavStat — these aren't counts, and a
    badge around "Craig" is a badge around a word. */
function NavFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="shrink-0 text-text-subtle">{label}</span>
      {/* min-w-0 or truncate does nothing on its own: a flex item's default
          min-width is auto, which floors it at its content and pushes past the
          panel when you drag it narrow. */}
      <span
        className="min-w-0 truncate text-right text-text-muted"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * An address with no workflow behind it.
 *
 * Reachable by typing a URL, by following a stale link, or by opening the
 * account fresh — so it offers both ways forward rather than only the one that
 * assumes you already have workflows.
 */
function NoWorkflow({ user }: { user: Session }) {
  return (
    <AppShell
      title="Workflows"
      account={{ name: user.name, email: user.email }}
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <EmptyState
          icon={<AltRoute />}
          title="There's no workflow here"
          description="Open one from your workflows, or tell Craig about your company and he'll draft one."
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/showcase/workflows"
                className={buttonVariants({ variant: "secondary", size: "sm" })}
              >
                All workflows
              </Link>
              <Link
                href="/showcase/welcome"
                className={buttonVariants({ size: "sm" })}
              >
                <AutoAwesome />
                Talk to Craig
              </Link>
            </div>
          }
        />
      </div>
    </AppShell>
  );
}
