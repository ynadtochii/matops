"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";

import { useTRPC } from "~/trpc/react";
import { CreateStudentDialog } from "./create-student-dialog";
import {
  OrganizationExportDialog,
  StudentImportDialog,
} from "./data-transfer-dialogs";
import { useAnyBranchTakesPayment, useEntity, useOrganization } from "./entity";
import { InviteLinkCard } from "./invite-link-card";
import { Members } from "./members";
import { PageHeader } from "./page-header";

export function MembersScreen() {
  const academy = useEntity();
  const { canRunOrganization } = useOrganization();

  return (
    <>
      <PageHeader
        title="Students"
        subtitle={`Everyone who trains at ${academy.name}.`}
        action={canRunOrganization ? <StudentActions /> : undefined}
      />
      <Members />
    </>
  );
}

function StudentActions() {
  const trpc = useTRPC();
  const { entities } = useOrganization();
  const payments = useAnyBranchTakesPayment();
  const [open, setOpen] = useState<
    "invite" | "add" | "import" | "export" | null
  >(null);
  const plans = useQuery({
    ...trpc.accessPlan.list.queryOptions(),
    enabled: payments && open === "import",
  });
  const close = (next: boolean) => {
    if (!next) setOpen(null);
  };

  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => setOpen("invite")}>
        Invite students
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen("add")}>
        Add student
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen("import")}>
        Import students
      </Button>
      <Button size="sm" variant="outline" onClick={() => setOpen("export")}>
        Export data
      </Button>
      <Dialog open={open === "invite"} onOpenChange={close}>
        <DialogContent className="max-w-lg">
          <DialogTitle>Invite students</DialogTitle>
          <DialogDescription>
            Share this link or its QR code. People who join wait for your
            approval before they can book.
          </DialogDescription>
          <InviteLinkCard
            role="student"
            label="Student link"
            hint="A forwarded link never opens access on its own."
          />
        </DialogContent>
      </Dialog>
      {open === "add" && (
        <CreateStudentDialog entities={entities} onOpenChange={close} />
      )}
      {open === "import" && (
        <StudentImportDialog
          entities={entities}
          plans={plans.data ?? []}
          payments={payments}
          onOpenChange={close}
        />
      )}
      {open === "export" && <OrganizationExportDialog onOpenChange={close} />}
    </div>
  );
}
