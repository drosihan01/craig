import { V3Director } from "@/components/v3/v3-director";

/**
 * Everything under /v3 gets the play button.
 *
 * In the layout rather than on each page so it survives navigation — the
 * director drives the demo *across* routes, and a control that unmounted every
 * time it moved you would stop the thing it just started.
 */
export default function V3Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <V3Director />
    </>
  );
}
