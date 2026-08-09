"use client";

import * as React from "react";
import {
  AppShell,
  Badge,
  Button,
  Dialog,
  DropdownMenu,
  EmptyState,
  List,
  ListIcon,
  ListItem,
  Separator,
} from "@/components/ui";
import {
  ShowcaseNav,
  ShowcaseNavRail,
} from "@/components/craig/nav";
import { NewWorkflowDialog } from "@/components/craig/new-workflow";
import {
  Add,
  AltRoute,
  Delete,
  MoreHoriz,
  Warning,
} from "@/components/ui/icons";
import { NavStat } from "@/components/app-nav";
import type { Session } from "@/lib/craig/contract";
import {
  deleteWorkflow,
  stepCount,
  unconfiguredCount,
  useShowcase,
  type ShowcaseWorkflow,
} from "@/lib/craig/store";

/**
 * Everything the account has, which for a long while is one thing or nothing.
 *
 * Deliberately not a dashboard. A new account has a single workflow at most,
 * and a page built for twenty would spend its whole first week apologising for
 * being empty — so the empty state is the design and the list is what happens
 * to it, rather than the other way round.
 *
 * The "new workflow" button doesn't make one. It asks how, and the asking is
 * the point: Craig writing these out of a conversation about how the company
 * actually works is still the version of this product that works, so he is the
 * first thing in the dialog and blank is the deliberate second choice. What the
 * dialog fixes is the other half of it — somebody who already knows exactly
 * what they want shouldn't have to be interviewed to get a canvas, and having
 * no button at all made that person's shortest route through the product a
 * conversation they didn't need.
 */

export function WorkflowList({ user }: { user: Session }) {
  const store = useShowcase();
  /**
   * Everything except a blank somebody started and has not touched.
   *
   * Pressing "Start blank" has to create a workflow immediately, because the
   * editor renders from the store and needs something to render. Until the
   * first edit that workflow is not real — it is not synced, and it is gone on
   * the next load — so listing it here would be this screen making a promise
   * the rest of the product does not keep. See `pending` in `store.ts`.
   */
  const workflows = React.useMemo(
    () => store.workflows.filter((w) => !w.pending),
    [store.workflows],
  );
  const [choosing, setChoosing] = React.useState(false);

  /**
   * Which workflow has been asked about, held here rather than in the row.
   *
   * The row is the thing being deleted: confirming removes it from the store,
   * which unmounts the row, which would take the open dialog down with it
   * mid-answer. Stored as an id rather than the workflow itself so the dialog
   * always reads the live record — a copy taken when the menu opened would
   * keep describing a step count that had since changed.
   */
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const pending = workflows.find((w) => w.id === pendingId) ?? null;

  const ready = workflows.filter(
    (w) => stepCount(w.blocks) > 0 && unconfiguredCount(w.blocks) === 0,
  ).length;

  return (
    <AppShell
      title="Workflows"
      account={{ name: user.name, email: user.email }}
      navRail={<ShowcaseNavRail />}
      nav={
        <ShowcaseNav>
          <ListNav total={workflows.length} ready={ready} />
        </ShowcaseNav>
      }
    >
      <div className="mx-auto w-full max-w-3xl py-10">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">
              Workflows
            </h1>
            <p className="text-md text-text-muted">
              One workflow per kind of hire. Open one to change its steps,
              answer what Craig left open, or publish it.
            </p>
          </div>

          {/* Only once there's a list. On an empty account the empty state
              below is already the whole page and already carries this exact
              button, so a second one up here is the same offer made twice on a
              screen with nothing else on it — and the one in the header is the
              weaker of the two, since it's the one with no explanation next to
              it. Once there are workflows the empty state is gone and this
              becomes the only way to add another. */}
          {workflows.length > 0 && (
            <Button
              size="sm"
              onClick={() => setChoosing(true)}
              className="shrink-0"
            >
              <Add />
              New workflow
            </Button>
          )}
        </header>

        {workflows.length === 0 ? (
          <EmptyState
            icon={<AltRoute />}
            title="Nothing here yet"
            description="Craig writes the first one out of a conversation about your company — what you sell, who does what, and who's arriving."
            /* Opens the same dialog as the header rather than going straight
               to Craig. The description still says he writes the first one and
               the dialog still recommends him — but an empty account is exactly
               where somebody arrives having already decided, and sending the
               only button on the screen into a conversation was how they found
               out there was another way afterwards. */
            action={
              <Button size="sm" onClick={() => setChoosing(true)}>
                <Add />
                New workflow
              </Button>
            }
          />
        ) : (
          <List>
            {workflows.map((w) => (
              <WorkflowRow
                key={w.id}
                workflow={w}
                onDelete={() => setPendingId(w.id)}
              />
            ))}
          </List>
        )}
      </div>

      {/* One dialog for both buttons. Two would be two pieces of state that
          can disagree, and the copy inside it would be free to drift into two
          different accounts of what the choice is. */}
      <NewWorkflowDialog open={choosing} onClose={() => setChoosing(false)} />

      {pending && (
        <ConfirmDelete
          workflow={pending}
          onCancel={() => setPendingId(null)}
          onConfirm={() => {
            deleteWorkflow(pending.id);
            setPendingId(null);
          }}
        />
      )}
    </AppShell>
  );
}

/**
 * The one thing on this screen that asks whether you're sure.
 *
 * Everywhere else this product states what will happen instead of asking — the
 * invite dialog says an email goes out the moment you press it, and that is
 * worth more than a confirmation, because a warning you can read beats a
 * button you can click twice. Deleting earns the exception by being the only
 * action here with nothing to undo it: there is no draft history and no
 * restore, so the workflow is simply gone.
 *
 * The published case gets its own sentence. Losing a draft loses work; deleting
 * a published workflow also stops the thing currently running the company's
 * onboarding, and those are not the same decision to make.
 *
 * Deliberately the same words as the confirmation in the editor. Two dialogs
 * that delete the same object and describe the consequences differently teach
 * that one of them is wrong, and the reader has no way to tell which.
 */
function ConfirmDelete({
  workflow,
  onCancel,
  onConfirm,
}: {
  workflow: ShowcaseWorkflow;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const steps = stepCount(workflow.blocks);

  return (
    <Dialog
      open
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

function WorkflowRow({
  workflow,
  onDelete,
}: {
  workflow: ShowcaseWorkflow;
  onDelete: () => void;
}) {
  const steps = stepCount(workflow.blocks);
  const open = unconfiguredCount(workflow.blocks);

  /* Three states, and the middle one is the one worth having. "Ready" is the
     difference between a workflow you could publish and one that only looks
     finished, and it's a distinction a step count alone can't make. */
  const state = workflow.published
    ? { label: "Published", tone: "success" as const }
    : open > 0
      ? { label: "Draft", tone: "warning" as const }
      : { label: "Ready", tone: "accent" as const };

  return (
    <ListItem
      href={`/workflows/${workflow.id}`}
      leading={
        <ListIcon tone="accent">
          <AltRoute />
        </ListIcon>
      }
      title={
        <span className="flex items-center gap-2">
          <span className="truncate">{workflow.name}</span>
          <Badge tone={state.tone} size="sm" className="shrink-0">
            {state.label}
          </Badge>
        </span>
      }
      description={`${steps} ${steps === 1 ? "step" : "steps"}`}
      /* Only says who wrote it when somebody did. A workflow with no author on
         it is one this account made itself, and "drafted by undefined" is how
         you find that out late. */
      footnote={
        workflow.draftedBy ? `Drafted by ${workflow.draftedBy}` : undefined
      }
      meta={
        open > 0 ? (
          <Badge tone="warning" size="sm">
            <Warning />
            {open} unconfigured
          </Badge>
        ) : undefined
      }
      /* In `trailing` because that slot already stops a click on a control
         from selecting the row it sits in. The row is a link, though, and
         stopping propagation is not the same as stopping an anchor: the
         browser's own navigation is a default action, and only
         `preventDefault` cancels it. Without the span below, opening this menu
         would also open the workflow underneath it. */
      trailing={
        <span onClick={(e) => e.preventDefault()}>
          <RowMenu workflow={workflow} onDelete={onDelete} />
        </span>
      }
    />
  );
}

/**
 * Row actions, which for now means the one action that has nowhere else to go.
 *
 * A menu holding a single item looks like an unfinished menu, and the honest
 * alternative — a delete button sitting in every row — is worse: it puts an
 * irreversible action one stray click from a list you scan, and it reads as
 * the point of the row. Deleting a workflow is genuinely rare, so it belongs
 * behind the overflow affordance people already know means "the rest of what
 * you can do here", where the second and third items will join it.
 *
 * Editing lives on the row itself rather than in here. The whole row is a link
 * to the workflow, and an "Open" item would be the same journey, made longer.
 */
function RowMenu({
  workflow,
  onDelete,
}: {
  workflow: ShowcaseWorkflow;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu
      /* Named after the workflow, because a list of rows each announcing
         "More" gives a screen reader no way to tell them apart. */
      label={`More for ${workflow.name}`}
      align="end"
      width="w-48"
      trigger={
        <span className="inline-flex size-7 items-center justify-center rounded-md text-text-subtle transition-colors hover:bg-surface-hover hover:text-text">
          <MoreHoriz className="size-4" />
        </span>
      }
      items={[
        {
          id: "delete",
          label: "Delete workflow",
          icon: <Delete />,
          destructive: true,
          /* Opens the confirmation rather than deleting. The menu item is
             where a mis-click lands; the dialog is where the decision is. */
          onSelect: onDelete,
        },
      ]}
    />
  );
}

function ListNav({ total, ready }: { total: number; ready: number }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 px-2">
        <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
          Workflows
        </p>
        <NavStat label="Total" value={total} />
        <NavStat
          label="Ready to publish"
          value={ready}
          tone={total > 0 && ready === 0 ? "warning" : "neutral"}
        />
      </div>

      <Separator />

      <p className="px-2 text-xs leading-relaxed text-text-subtle">
        A workflow is ready once every step has what it needs. Until then Craig
        can&apos;t run it for anybody.
      </p>
    </div>
  );
}
