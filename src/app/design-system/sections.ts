export interface NavItem {
  id: string;
  label: string;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

/** Single source of truth for the rail and the page order. */
export const SECTIONS: NavGroup[] = [
  {
    group: "Foundations",
    items: [
      { id: "colour", label: "Colour" },
      { id: "typography", label: "Typography" },
      { id: "space", label: "Space & radius" },
      { id: "elevation", label: "Elevation" },
      { id: "motion", label: "Motion" },
    ],
  },
  {
    group: "Components",
    items: [
      { id: "button", label: "Button" },
      { id: "inputs", label: "Inputs" },
      { id: "selection", label: "Selection" },
      { id: "badge", label: "Badge & status" },
      { id: "card", label: "Card" },
      { id: "avatar", label: "Avatar" },
      { id: "tabs", label: "Tabs" },
      { id: "progress", label: "Progress & steps" },
      { id: "feedback", label: "Feedback" },
    ],
  },
  {
    group: "Patterns",
    items: [{ id: "patterns", label: "In context" }],
  },
];

export const ALL_IDS = SECTIONS.flatMap((g) => g.items.map((i) => i.id));
