import type { PropDoc } from "./api";

/* Prop references for the components added after v0.1's first pass. Kept apart
   from the page so the showcase stays readable. */

export const DROPDOWN_PROPS: PropDoc[] = [
  {
    name: "trigger",
    type: "ReactNode",
    required: true,
    description:
      "Rendered inside the trigger button. Style the span you pass, not the button — the button only carries the ARIA and the click.",
  },
  {
    name: "items",
    type: "DropdownItem[]",
    required: true,
    description:
      "Each takes id, label, and optionally description, icon, tag, disabled, destructive, separatorBefore and onSelect.",
  },
  {
    name: "label",
    type: "string",
    required: true,
    description:
      "Accessible name for the trigger and the menu. Required because the trigger is usually an icon.",
  },
  {
    name: "selectedId",
    type: "string",
    description:
      "Set it and the menu becomes a listbox that ticks the current value. Leave it off for an action menu.",
  },
  {
    name: "onSelect",
    type: "(id: string) => void",
    description: "Fires after the item's own onSelect, then closes the menu.",
  },
  {
    name: "side",
    type: '"top" | "bottom"',
    default: '"bottom"',
    description: "Which way the menu opens. Use top when it sits near the page bottom.",
  },
  {
    name: "align",
    type: '"start" | "end"',
    default: '"start"',
    description: "Which edge the menu aligns to.",
  },
  {
    name: "width",
    type: "string",
    default: '"w-56"',
    description: "Tailwind width class for the menu.",
  },
  {
    name: "triggerClassName",
    type: "string",
    description:
      "Applied to the trigger button. Pass w-full to make the trigger fill its cell — without it the button hugs its content.",
  },
];

export const CALENDAR_PROPS: PropDoc[] = [
  {
    name: "value",
    type: "Date | null",
    description: "The selected day. Compared by day, not by instant.",
  },
  {
    name: "onChange",
    type: "(date: Date) => void",
    description: "Fires with a local-midnight Date for the clicked day.",
  },
  {
    name: "min / max",
    type: "Date",
    description:
      "Bounds. Days outside are struck through and not clickable — enforce the same rule server-side.",
  },
  {
    name: "weekStartsOn",
    type: "0 | 1",
    default: "1",
    description: "0 for Sunday, 1 for Monday.",
  },
  {
    name: "locale",
    type: "string",
    default: '"en-AU"',
    description: "Drives the weekday initials and the month heading via Intl.",
  },
];

export const DATEPICKER_PROPS: PropDoc[] = [
  {
    name: "value / onChange",
    type: "Date | null · (date: Date) => void",
    description: "Same contract as Calendar; the popover closes on select.",
  },
  {
    name: "min / max",
    type: "Date",
    description: "Passed straight through to the Calendar inside.",
  },
  {
    name: "placeholder",
    type: "string",
    default: '"Pick a date"',
    description: "Shown when nothing is selected.",
  },
  {
    name: "id",
    type: "string",
    description:
      "Wire this to a Field so the label points at the trigger. Field sets it for you.",
  },
];

export const DIALOG_PROPS: PropDoc[] = [
  {
    name: "open / onClose",
    type: "boolean · () => void",
    required: true,
    description:
      "Fully controlled. onClose fires on Escape, backdrop click and the close button.",
  },
  {
    name: "title",
    type: "ReactNode",
    description: "Also becomes the dialog's accessible name via aria-labelledby.",
  },
  {
    name: "description",
    type: "ReactNode",
    description: "Sits under the title and is wired to aria-describedby.",
  },
  {
    name: "size",
    type: '"sm" | "md" | "lg" | "chat"',
    default: '"md"',
    description:
      "chat is tall and fixed-height so a composer pinned at the bottom doesn't move as messages arrive.",
  },
  {
    name: "footer",
    type: "ReactNode",
    description: "Right-aligned action row on a sunken bar.",
  },
  {
    name: "bare",
    type: "boolean",
    default: "false",
    description: "Drops the built-in header when the content supplies its own.",
  },
];

export const CHAT_PROPS: PropDoc[] = [
  {
    name: "open / onClose",
    type: "boolean · () => void",
    required: true,
    description: "Controlled, same as Dialog.",
  },
  {
    name: "messages",
    type: "ChatMessage[]",
    required: true,
    description:
      "id, role, content, plus optional streaming and model. Set streaming to render the caret; the list pins to the bottom as it grows.",
  },
  {
    name: "onSend",
    type: "(text, model) => void",
    required: true,
    description:
      "Receives the chosen model alongside the text, so the caller can route to the right endpoint.",
  },
  {
    name: "busy / onStop",
    type: "boolean · () => void",
    description: "While busy the send button becomes a stop button.",
  },
  {
    name: "model / onModelChange",
    type: "ChatModel · (m) => void",
    description:
      "Optional. Left uncontrolled it manages its own, defaulting to Craigson Lambda 2.0.",
  },
  {
    name: "suggestions",
    type: "string[]",
    description: "Starter prompts shown on the empty state; clicking one sends it.",
  },
];

export const PROMPTBAR_PROPS: PropDoc[] = [
  {
    name: "onSubmit",
    type: "(text: string) => void",
    required: true,
    description: "Enter sends and clears; Shift+Enter breaks the line.",
  },
  {
    name: "size",
    type: '"sm" | "lg"',
    default: '"lg"',
    description: "lg for a page-level prompt, sm inside the chat modal.",
  },
  {
    name: "model / onModelChange",
    type: "ChatModel · (m) => void",
    description:
      "Optional. Left uncontrolled it manages its own, defaulting to Craigson Lambda 2.0.",
  },
  {
    name: "busy / onStop",
    type: "boolean · () => void",
    description: "While busy the send button becomes a stop button.",
  },
  {
    name: "footnote",
    type: "ReactNode",
    description: "Line under the bar — disclaimer, hint, character count.",
  },
  {
    name: "placeholder",
    type: "string",
    default: '"Type / for skills"',
    description: "Composer placeholder.",
  },
];

export const APPSHELL_PROPS: PropDoc[] = [
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description: "The page content, in the centre column.",
  },
  {
    name: "nav",
    type: "ReactNode",
    description:
      "Left panel content. Omit it and the brand cell shrinks and the toggle disappears.",
  },
  {
    name: "aside / asideTitle",
    type: "ReactNode · string",
    default: '— · "Details"',
    description: "Right panel content and its heading.",
  },
  {
    name: "account",
    type: "AccountInfo",
    description:
      "name, and optionally email and role. Renders in the pinned bottom cell of the left panel.",
  },
  {
    name: "title",
    type: "ReactNode",
    description: "Page title, in the centre header cell.",
  },
  {
    name: "actions",
    type: "ReactNode",
    description:
      "Header controls, in the right cell before the theme and panel toggles.",
  },
];

export const WORKFLOW_PROPS: PropDoc[] = [
  {
    name: "steps",
    type: "WorkflowStep[]",
    required: true,
    description:
      "id, title, status, and optionally description, metrics, primaryAction and secondaryAction.",
  },
  {
    name: "title",
    type: "string",
    description: "Section heading. Shows an 'n of m complete' count beside it.",
  },
];

export const AUTH_PROPS: PropDoc[] = [
  {
    name: "AuthShell",
    type: "title, subtitle, footer",
    description:
      "Centres a card on the canvas with the wordmark above it. Wraps the whole screen.",
  },
  {
    name: "GoogleButton",
    type: "onClick, loading, label",
    description:
      "Full-width. The mark keeps Google's four brand colours on a white chip in both themes, as their guidelines require.",
  },
  {
    name: "AuthDivider",
    type: "label",
    description: 'Rule with centred text. Defaults to "or".',
  },
  {
    name: "PasswordInput",
    type: "all <input> props",
    description:
      "Adds a reveal toggle. Forwards its ref, so it drops into a Field like any other control.",
  },
];

export const BUILDER_PROPS: PropDoc[] = [
  {
    name: "blocks",
    type: "WorkflowBlock[]",
    required: true,
    description:
      "id, kind, title, and optionally summary, owner and incomplete. Index 0 must be the trigger.",
  },
  {
    name: "selectedId / onSelect",
    type: "string | null · (id) => void",
    description:
      "Selection is owned by the caller, so the same state can drive the inspector in the right panel.",
  },
  {
    name: "onInsert",
    type: "(kind, index) => void",
    description:
      "index is the position the new block should occupy. Fired from the connector between blocks.",
  },
  {
    name: "onMove",
    type: "(id, -1 | 1) => void",
    description:
      "Swap with the neighbour. The trigger is excluded and index 0 is never a valid destination.",
  },
  {
    name: "onRemove / onDuplicate",
    type: "(id: string) => void",
    description: "Omitted automatically for the trigger, which is structural.",
  },
];
