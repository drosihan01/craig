"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AppShell,
  Badge,
  Button,
  CraigMark,
  Separator,
  useAgentWork,
  WorkflowBuilder,
  WorkflowCanvas,
} from "@/components/ui";
import { V3_ACCOUNT, V3_STARTER } from "@/lib/v3/company";
import { V3_ANSWERS, V3_WORKFLOW } from "@/lib/v3/workflow";
import {
  answerBlock,
  openBlocks,
  publish,
  setScene,
  useV3,
} from "@/lib/v3/store";
import { V3Nav } from "@/components/v3/v3-nav";
import { V3AddSeat } from "@/components/v3/v3-add-seat";

/**
 * Scene four — the two things Craig wouldn't guess at.
 *
 * The canvas is the same builder the rest of the product uses. What's
 * different is the panel: instead of Craig waiting to be asked, he opens with
 * the two questions he couldn't answer from three documents, and says why he
 * didn't answer them himself.
 *
 * That's the whole argument for the gate. Publish is disabled while either is
 * open, not to nag but because a workflow with an unanswered step doesn't fail
 * when you publish it — it fails ten days later, on somebody's first morning,
 * in front of them.
 */
export default function V3BuilderPage() {
  const router = useRouter();
  const { blocks, published } = useV3();
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [adding, setAdding] = React.useState(false);

  const open = openBlocks(blocks);

  return (
    <AppShell
      title={V3_WORKFLOW.name}
      account={V3_ACCOUNT}
      fill
      nav={
        <V3Nav>
          <div className="flex flex-col gap-2 px-2">
            <p className="text-2xs font-semibold uppercase tracking-[0.06em] text-text-subtle">
              Overview
            </p>
            <NavRow label="Steps" value={String(blocks.length - 1)} />
            <NavRow
              label="Unanswered"
              value={String(open.length)}
              warn={open.length > 0}
            />
            <NavRow label="Written by" value="Craig, from SOP-014" />
          </div>

          <Separator />

          <p className="px-2 text-xs leading-relaxed text-text-subtle">
            {published
              ? "Published. Give someone a seat and it runs against them."
              : "A workflow can't be published while a step still has an open question."}
          </p>
        </V3Nav>
      }
      actions={
        published ? (
          <Button size="sm" onClick={() => setAdding(true)} data-v3-invite>
            Add your first person
          </Button>
        ) : (
          <Button
            size="sm"
            disabled={open.length > 0}
            onClick={publish}
            data-v3-publish
          >
            Publish
          </Button>
        )
      }
      asideTitle={published ? undefined : "Craig"}
      aside={
        <div className="flex min-h-0 flex-1 flex-col gap-5">
          {published ? (
            <Published onAdd={() => setAdding(true)} />
          ) : (
            <Questions blocks={blocks} onSelect={setSelectedId} />
          )}
        </div>
      }
    >
      <div className="-mx-4 h-[calc(100vh-3rem)] lg:-mx-8">
        <WorkflowCanvas
          className="h-full rounded-none border-0"
          onBackgroundClick={() => setSelectedId(null)}
        >
          <div className="px-10 py-12">
            <WorkflowBuilder
              blocks={blocks}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>
        </WorkflowCanvas>
      </div>

      <V3AddSeat
        open={adding}
        onClose={() => setAdding(false)}
        onInvited={() => {
          setAdding(false);
          setScene("invited");
          router.push(`/v3/people/${V3_STARTER.id}`);
        }}
      />
    </AppShell>
  );
}

/**
 * Craig's two open questions.
 *
 * Each says what he'd have had to invent, which is the part that makes the
 * question worth answering rather than an obstacle. "Which provider" is a
 * chore; "Calder has never run one, so there's no account and no consent form
 * to send her" is a thing Theo genuinely didn't know he hadn't decided.
 */
function Questions({
  blocks,
  onSelect,
}: {
  blocks: ReturnType<typeof useV3>["blocks"];
  onSelect: (id: string) => void;
}) {
  /* One phase, and it's the id of the question he's writing in rather than a
     label — the button says what he's doing, so a second sentence beside it
     would be him narrating a click. The beat is the point: an answer that
     lands the instant you ask for it reads as a value that was always there. */
  const work = useAgentWork({ beat: 1100 });
  const busy = work.phase;

  const open = openBlocks(blocks);

  function answer(id: string) {
    const a = V3_ANSWERS[id];
    if (!a || busy) return;
    work.run([id], () => answerBlock(id, a.config));
  }

  if (open.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <CraigMark className="size-5 text-accent" />
        <p className="text-sm leading-relaxed text-text-muted">
          That&apos;s both of them. Every step has what it needs now, so this
          will run start to finish without anyone chasing it. Publish when
          you&apos;re ready.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <CraigMark className="size-5 text-accent" />
        <p className="text-sm leading-relaxed text-text-muted">
          I&apos;ve written the rest of it. {open.length} step
          {open.length === 1 ? "" : "s"} I wouldn&apos;t guess at — both of them
          would have been wrong in a way you&apos;d only find out on her first
          day.
        </p>
      </div>

      {open.map((b) => (
        <div key={b.id} className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => onSelect(b.id)}
            className="w-fit text-left text-base font-medium hover:text-accent"
          >
            {b.title}
          </button>
          <p className="text-sm leading-relaxed text-text-muted">
            {b.incomplete}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="w-fit"
            disabled={busy === b.id}
            onClick={() => answer(b.id)}
            data-v3-answer={b.id}
          >
            {busy === b.id ? "Writing it in…" : "Answer"}
          </Button>
          {busy === b.id && (
            <p className="text-xs italic leading-relaxed text-text-subtle">
              “{V3_ANSWERS[b.id]?.said}”
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function Published({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <CraigMark className="size-5 text-accent" />
        <Badge tone="success" size="sm" className="w-fit">
          Published
        </Badge>
        <p className="text-sm leading-relaxed text-text-muted">
          That&apos;s live. Give {V3_STARTER.name.split(" ")[0]} a seat and it
          starts immediately — including the police check, which is the one you
          can&apos;t make up later.
        </p>
      </div>
      <Button size="sm" className="w-fit" onClick={onAdd}>
        Add your first person
      </Button>
    </div>
  );
}

function NavRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-xs">
      <span className="shrink-0 text-text-subtle">{label}</span>
      {warn ? (
        <Badge tone="warning" size="sm">
          {value}
        </Badge>
      ) : (
        <span className="min-w-0 truncate text-right text-text-muted">
          {value}
        </span>
      )}
    </div>
  );
}
