"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { RouterOutputs } from "@matops/api";
import { csvDocument } from "@matops/domain";
import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

type ImportPreview = RouterOutputs["dataTransfer"]["previewStudentImport"];
type DuplicateDecision =
  | { rowNumber: number; kind: "use_existing"; personId: string }
  | {
      rowNumber: number;
      kind: "create_separate";
      reviewedPersonIds: string[];
    };

const columns = {
  name: "name",
  email: "email",
  phone: "phone",
  branch: "branch",
  plan: "plan",
  startMonth: "start_month",
  paymentMonth: "payment_month",
  paymentStatus: "payment_status",
};

export function StudentImportDialog({
  entities,
  plans,
  onOpenChange,
}: {
  entities: { id: string; name: string }[];
  plans: { id: string; name: string; archived: boolean }[];
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [csv, setCsv] = useState("name,email,phone\n");
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [planId, setPlanId] = useState("");
  const [paymentStatus, setPaymentStatus] = useState<"" | "paid" | "unpaid">(
    "",
  );
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [decisions, setDecisions] = useState<DuplicateDecision[]>([]);
  const input = {
    csv,
    columns,
    defaults: {
      entityId: entityId || undefined,
      planId: planId || undefined,
      paymentStatus: paymentStatus || undefined,
    },
  };
  const commit = useMutation(
    trpc.dataTransfer.commitStudentImport.mutationOptions({
      onSuccess: async (result) => {
        await queryClient.invalidateQueries();
        toast.success(
          `${result.imported.length} ${result.imported.length === 1 ? "student" : "students"} imported`,
        );
        onOpenChange(false);
      },
      onError: (error) => toast.error(error.message),
    }),
  );
  const review = async () => {
    setReviewing(true);
    try {
      const result = await queryClient.fetchQuery(
        trpc.dataTransfer.previewStudentImport.queryOptions(input),
      );
      setPreview(result);
      setDecisions([]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't preview the import. Check the file and try again.",
      );
    } finally {
      setReviewing(false);
    }
  };
  const decide = (decision: DuplicateDecision) =>
    setDecisions((current) => [
      ...current.filter((item) => item.rowNumber !== decision.rowNumber),
      decision,
    ]);
  const unresolved =
    preview?.rows.filter(
      (row) =>
        row.state === "needs_decision" &&
        !decisions.some((decision) => decision.rowNumber === row.rowNumber),
    ).length ?? 0;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogTitle>Import students</DialogTitle>
        <div className="flex flex-col gap-4">
          <p className="text-muted-foreground text-sm">
            Paste CSV or choose a file. Use name, email, phone, branch, plan,
            start_month, payment_month, and payment_status headers.
          </p>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void file.text().then((text) => setCsv(text));
              setPreview(null);
            }}
          />
          <Textarea
            value={csv}
            rows={8}
            onChange={(event) => {
              setCsv(event.target.value);
              setPreview(null);
            }}
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-branch">Default branch</Label>
              <Select
                id="import-branch"
                value={entityId}
                onChange={(event) => setEntityId(event.target.value)}
              >
                <option value="">Use the branch column</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-plan">Default membership</Label>
              <Select
                id="import-plan"
                value={planId}
                onChange={(event) => setPlanId(event.target.value)}
              >
                <option value="">No default</option>
                {plans
                  .filter((plan) => !plan.archived)
                  .map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="import-paid">Starting payment</Label>
              <Select
                id="import-paid"
                value={paymentStatus}
                onChange={(event) =>
                  setPaymentStatus(event.target.value as "" | "paid" | "unpaid")
                }
              >
                <option value="">Use the CSV</option>
                <option value="unpaid">Unpaid</option>
                <option value="paid">Paid</option>
              </Select>
            </div>
          </div>
          {preview && (
            <div className="flex flex-col gap-3">
              <p className="text-sm">
                {preview.summary.ready} ready, {preview.summary.needsDecision}{" "}
                need a duplicate decision, {preview.summary.rejected} rejected
              </p>
              {preview.rows.map((row) => (
                <div
                  key={row.rowNumber}
                  className="border-border rounded-md border p-3 text-sm"
                >
                  <p className="font-medium">
                    Row {row.rowNumber}: {row.normalized?.name ?? "Invalid row"}
                  </p>
                  {row.errors.map((error) => (
                    <p
                      key={`${error.field}:${error.message}`}
                      className="text-error"
                    >
                      {error.field}: {error.message}
                    </p>
                  ))}
                  {row.state === "needs_decision" && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {row.duplicates.map((match) => (
                        <Button
                          key={match.personId}
                          size="sm"
                          variant="outline"
                          disabled={match.archivedAt !== null}
                          onClick={() =>
                            decide({
                              rowNumber: row.rowNumber,
                              kind: "use_existing",
                              personId: match.personId,
                            })
                          }
                        >
                          Use {match.name}
                          {match.archivedAt ? " (archived)" : ""}
                        </Button>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          decide({
                            rowNumber: row.rowNumber,
                            kind: "create_separate",
                            reviewedPersonIds: row.duplicates.map(
                              (match) => match.personId,
                            ),
                          })
                        }
                      >
                        Create separate
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={reviewing || csv.trim() === ""}
              onClick={() => void review()}
            >
              {reviewing ? "Reviewing…" : "Preview"}
            </Button>
            {preview && (
              <Button
                disabled={
                  commit.isPending ||
                  unresolved > 0 ||
                  preview.summary.ready + preview.summary.needsDecision === 0
                }
                onClick={() =>
                  commit.mutate({
                    ...input,
                    previewHash: preview.previewHash,
                    excludedRows: preview.rows
                      .filter((row) => row.state === "rejected")
                      .map((row) => row.rowNumber),
                    decisions,
                  })
                }
              >
                {commit.isPending
                  ? "Importing…"
                  : `Import ${preview.summary.ready + preview.summary.needsDecision}`}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function OrganizationExportDialog({
  onOpenChange,
}: {
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [started, setStarted] = useState<
    RouterOutputs["dataTransfer"]["startExport"] | null
  >(null);
  const prepare = async () => {
    setBusy("prepare");
    try {
      setStarted(
        await queryClient.fetchQuery(
          trpc.dataTransfer.startExport.queryOptions({}),
        ),
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't prepare the export. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };
  const download = async (
    item: NonNullable<typeof started>["datasets"][number],
  ) => {
    if (!started) return;
    setBusy(item.dataset);
    try {
      const rows: (string | number | boolean | null)[][] = [];
      let cursor: string | undefined;
      do {
        const page = await queryClient.fetchQuery(
          trpc.dataTransfer.exportPage.queryOptions({
            dataset: item.dataset,
            exportedAt: started.exportedAt.toISOString(),
            cursor,
            limit: 500,
          }),
        );
        rows.push(...(page.rows as (string | number | boolean | null)[][]));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      const url = URL.createObjectURL(
        new Blob([csvDocument(item.headers, rows)], {
          type: "text/csv;charset=utf-8",
        }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = item.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't export the data. Try again.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Export gym data</DialogTitle>
        <p className="text-muted-foreground text-sm">
          These files include archived people, attendance, and payment history.
          Current filters do not change them.
        </p>
        {!started ? (
          <Button disabled={busy !== null} onClick={() => void prepare()}>
            {busy ? "Preparing…" : "Prepare export"}
          </Button>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {started.datasets.map((item) => (
              <Button
                key={item.dataset}
                variant="outline"
                disabled={busy !== null}
                onClick={() => void download(item)}
              >
                {busy === item.dataset
                  ? "Downloading…"
                  : `Download ${item.fileName}`}
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
