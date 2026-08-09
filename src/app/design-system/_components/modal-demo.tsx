"use client";

import * as React from "react";
import { Button } from "@/components/ui";
import { PersonAdd, Lock, CheckCircle } from "@/components/ui/icons";
import { AddSeat } from "@/components/add-seat";
import { CelebrateDialog } from "@/components/v3/celebrate-dialog";
import { PaywallDialog } from "@/components/v3/paywall-dialog";

/**
 * The product's own dialogs, opened from here.
 *
 * AddSeat's onAdd is a no-op — the caller owns the seat list, so nothing
 * escapes this page. V3AddSeat is documented but not mounted: sending its
 * invite advances the v3 demo's store, and a design system shouldn't move a
 * demo somebody else is halfway through.
 */
export function ModalFamilyDemo() {
  const [seat, setSeat] = React.useState(false);
  const [celebrate, setCelebrate] = React.useState(false);
  const [paywall, setPaywall] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="secondary" onClick={() => setSeat(true)}>
        <PersonAdd />
        Add someone
      </Button>
      <Button variant="secondary" onClick={() => setCelebrate(true)}>
        <CheckCircle />
        Onboarding finished
      </Button>
      <Button variant="secondary" onClick={() => setPaywall(true)}>
        <Lock />
        Out of seats
      </Button>

      <AddSeat open={seat} onClose={() => setSeat(false)} onAdd={() => {}} />
      <CelebrateDialog open={celebrate} onClose={() => setCelebrate(false)} />
      <PaywallDialog open={paywall} onClose={() => setPaywall(false)} />
    </div>
  );
}
