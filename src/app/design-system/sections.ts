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
      { id: "brand", label: "Brand" },
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
      { id: "icons", label: "Icons" },
      { id: "button", label: "Button" },
      { id: "inputs", label: "Inputs" },
      { id: "selection", label: "Selection" },
      { id: "badge", label: "Badge & status" },
      { id: "card", label: "Card" },
      { id: "avatar", label: "Avatar" },
      { id: "tabs", label: "Tabs" },
      { id: "progress", label: "Progress & steps" },
      { id: "feedback", label: "Feedback" },
      { id: "notifications", label: "Notifications" },
      { id: "dropdown", label: "Dropdown" },
      { id: "calendar", label: "Calendar" },
      { id: "dialog", label: "Dialog" },
      { id: "chat", label: "Chat" },
    ],
  },
  {
    group: "Patterns",
    items: [
      { id: "shell", label: "App shell" },
      { id: "builder", label: "Workflow builder" },
      { id: "auth", label: "Auth" },
      { id: "patterns", label: "In context" },
    ],
  },
];

export const ALL_IDS = SECTIONS.flatMap((g) => g.items.map((i) => i.id));
