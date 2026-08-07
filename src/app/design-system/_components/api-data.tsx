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
      "Optional. Left uncontrolled it manages its own, defaulting to Craigopilot.",
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
      "Optional. Left uncontrolled it manages its own, defaulting to Craigopilot.",
  },
  {
    name: "busy / onStop",
    type: "boolean · () => void",
    description: "While busy the send button becomes a stop button.",
  },
  {
    name: "dictation",
    type: "boolean",
    default: "true",
    description:
      "Speech-to-text into this field. Not a live-voice mode — that's a different interaction with different expectations.",
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
    name: "fill",
    type: "boolean",
    default: "false",
    description:
      "For pages that manage their own full-height layout. Drops the content column's bottom padding, which otherwise makes the document taller than the viewport and lets the page scroll under a pinned composer.",
  },
  {
    name: "actions",
    type: "ReactNode",
    description:
      "The page's own actions — rendered in the centre cell, left-aligned beside the title. The right cell is system chrome only (notifications, theme, panel toggle), so the two don't compete.",
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
  {
    name: "ContinueAs",
    type: "account, onContinue, onUseAnother",
    description:
      "\"Continue as …\" for a device that has signed in before. A hint about who was here last, never proof of who they are — clicking it starts a real sign-in. Always pair it with a way to use another account.",
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

export const MARK_PROPS: PropDoc[] = [
  {
    name: "strokeWidth",
    type: "number",
    default: "MARK_STROKE (9)",
    description:
      "Don't vary it. One weight at every size is what keeps the mark the same mark; the size floor is MARK_MIN_SIZE (20px), below which the wordmark goes alone.",
  },
  {
    name: "className",
    type: "string",
    description:
      "Sizing and colour. The mark strokes in currentColor, so it inherits from whatever it sits in.",
  },
  {
    name: "title",
    type: "string",
    description:
      "Give it one only when the mark is the sole label. Without it the SVG is aria-hidden, which is right beside the wordmark.",
  },
];

export const CANVAS_PROPS: PropDoc[] = [
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description: "The pannable content. Put CanvasPanel children here too.",
  },
  {
    name: "className",
    type: "string",
    description:
      "Set the viewport height here — the canvas clips to it. It has no intrinsic size.",
  },
];

export const CANVASPANEL_PROPS: PropDoc[] = [
  {
    name: "side",
    type: '"top-left" | "top-right" | "bottom-left"',
    default: '"top-left"',
    description:
      "Which corner it floats in. bottom-right is taken by the zoom controls.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description:
      "Panel contents. Pointer events are stopped inside, so interacting with a panel never pans the canvas.",
  },
];

export const SELECTMENU_PROPS: PropDoc[] = [
  {
    name: "value / onChange",
    type: "string · (id: string) => void",
    required: true,
    description: "Controlled. onChange receives the chosen option's id.",
  },
  {
    name: "options",
    type: "DropdownItem[]",
    required: true,
    description: "Same shape as DropdownMenu — descriptions and icons included.",
  },
  {
    name: "label",
    type: "string",
    required: true,
    description: "Accessible name for the trigger and the listbox.",
  },
  {
    name: "placeholder",
    type: "string",
    default: '"Select…"',
    description: "Shown when value matches no option.",
  },
  {
    name: "invalid",
    type: "boolean",
    description:
      "Draws the error border. Carried on a data attribute, since role=button doesn't support aria-invalid.",
  },
];

export const TEXTAREA_PROPS: PropDoc[] = [
  {
    name: "autoResize",
    type: "boolean",
    default: "true",
    description:
      "Grow to fit, then scroll. Hides the native grabber while on — dragging to a height the next keystroke overwrites is just noise.",
  },
  {
    name: "minRows / maxRows",
    type: "number",
    default: "3 · 12",
    description: "Starting height, and where it stops growing and scrolls.",
  },
];

export const BACKLINK_PROPS: PropDoc[] = [
  {
    name: "href",
    type: "string",
    required: true,
    description: "Where back goes.",
  },
  {
    name: "children",
    type: "ReactNode",
    required: true,
    description:
      "Name the destination — 'Back to design system', not 'Back'. It sits in the content column, above the page title.",
  },
];

export const TOAST_PROPS: PropDoc[] = [
  {
    name: "title",
    type: "ReactNode",
    required: true,
    description: "The whole message, if it fits in one line. Keep it short.",
  },
  {
    name: "tone",
    type: '"neutral" | "success" | "warning" | "danger"',
    default: '"neutral"',
    description:
      "danger renders role=alert with aria-live=assertive so it interrupts; the rest are polite.",
  },
  {
    name: "duration",
    type: "number",
    default: "5000",
    description:
      "ms. Pass 0 to require an explicit dismiss — use it for anything the user must actually read.",
  },
  {
    name: "action",
    type: "{ label, onClick }",
    description:
      "One action, e.g. Undo. Dismisses the toast after firing.",
  },
];

export const NOTIFICATION_PROPS: PropDoc[] = [
  {
    name: "items",
    type: "AppNotification[]",
    required: true,
    description:
      "id, kind, title, timestamp, and optionally description, actor, read and href.",
  },
  {
    name: "onSelect",
    type: "(id: string) => void",
    description:
      "Fired when one is opened. Marking read is the caller's call — the panel never does it on its own.",
  },
  {
    name: "onMarkAllRead",
    type: "() => void",
    description: "Omit it and the button doesn't render.",
  },
];

export const LIST_PROPS: PropDoc[] = [
  {
    name: "leading",
    type: "ReactNode",
    description:
      "Avatar, ListIcon, checkbox. Sits outside the divider inset, so a column of them lines up.",
  },
  {
    name: "title",
    type: "ReactNode",
    required: true,
    description: "The only required slot. Truncates to one line.",
  },
  {
    name: "description",
    type: "ReactNode",
    description: "Supporting line, clamped to two. A row isn't a paragraph.",
  },
  {
    name: "footnote",
    type: "ReactNode",
    description: "Third line, quieter still.",
  },
  {
    name: "overline",
    type: "ReactNode",
    description: "Small label above the title, for a type or category.",
  },
  {
    name: "meta",
    type: "ReactNode",
    description: "Right-aligned text — a count, a timestamp.",
  },
  {
    name: "trailing",
    type: "ReactNode",
    description:
      "Controls: a badge, a menu, a select. Clicks inside don't trigger the row.",
  },
  {
    name: "href / onClick",
    type: "string · () => void",
    description:
      "Makes the whole row a target. href renders a Link, onClick a button — the row shouldn't be a div with a handler.",
  },
];

export const FILTER_PROPS: PropDoc[] = [
  {
    name: "label",
    type: "string",
    required: true,
    description:
      "The field name. Shown alone when nothing is selected, and as “Role: Admin” when something is.",
  },
  {
    name: "options",
    type: "FilterOption[]",
    required: true,
    description: "{ id, label } — the values this field can take.",
  },
  {
    name: "selected",
    type: "string[]",
    required: true,
    description:
      "Selected ids. Empty means no filter, not “nothing matches”. Multi-select: filters within a field are OR, filters across fields are AND.",
  },
  {
    name: "onChange",
    type: "(selected: string[]) => void",
    required: true,
    description: "Called with the next selection. Clearing passes [].",
  },
];

export const SORT_PROPS: PropDoc[] = [
  {
    name: "value",
    type: "SortState",
    required: true,
    description: "{ field, direction }. Both live in one object so a page holds one piece of sort state, not two.",
  },
  {
    name: "options",
    type: "FilterOption[]",
    required: true,
    description: "The fields that can be sorted on.",
  },
  {
    name: "onChange",
    type: "(value: SortState) => void",
    required: true,
    description:
      "Fires for both halves — picking a field from the menu, and toggling direction with the arrow button.",
  },
];

export const FILTER_BAR_PROPS: PropDoc[] = [
  {
    name: "shown / total",
    type: "number",
    description:
      "Renders “Showing 2 of 4”. Pass both or neither. Omitting them hides the count line entirely.",
  },
  {
    name: "noun",
    type: "string",
    default: '"results"',
    description: "Pluralised by the caller — “people”, “documents”.",
  },
  {
    name: "onClear",
    type: "() => void",
    description:
      "Renders “Clear filters”, but only while something is actually filtered.",
  },
];
