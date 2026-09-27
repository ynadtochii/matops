"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@matops/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@matops/ui/dialog";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { toast } from "@matops/ui/toast";

import { useTRPC } from "~/trpc/react";

export function CreateStudentDialog({
  entities,
  onOpenChange,
}: {
  entities: { id: string; name: string }[];
  onOpenChange: (open: boolean) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [entityId, setEntityId] = useState(entities[0]?.id ?? "");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const input = {
    name: name.trim() || "Student",
    email: email.trim() || undefined,
    phone: phone.trim() || undefined,
  };
  const preview = useQuery({
    ...trpc.person.previewCreateStudent.queryOptions(input),
    enabled: reviewed,
  });
  const create = useMutation(
    trpc.person.createStudent.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries();
        toast.success("Student added");
        onOpenChange(false);
      },
      onError: (error) =>
        toast.error(error.message || "Couldn't add the student. Try again."),
    }),
  );
  const resetReview = () => setReviewed(false);
  const submit = (
    duplicateDecision?:
      | { kind: "use_existing"; personId: string }
      | { kind: "create_separate"; reviewedPersonIds: string[] },
  ) => create.mutate({ entityId, ...input, duplicateDecision });

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Add a student</DialogTitle>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-branch">Branch</Label>
            <Select
              id="new-student-branch"
              value={entityId}
              onChange={(event) => setEntityId(event.target.value)}
            >
              <option value="">Pick a branch…</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-name">Name</Label>
            <Input
              id="new-student-name"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                resetReview();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-email">Email, optional</Label>
            <Input
              id="new-student-email"
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                resetReview();
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-student-phone">Phone, optional</Label>
            <Input
              id="new-student-phone"
              type="tel"
              value={phone}
              onChange={(event) => {
                setPhone(event.target.value);
                resetReview();
              }}
            />
          </div>
          {preview.isError && (
            <p role="alert" className="text-error-text text-sm">
              {preview.error.message}
            </p>
          )}
          {preview.data && preview.data.length > 0 && (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">Possible matches</p>
              {preview.data.map((match) => (
                <div
                  key={match.personId}
                  className="border-border flex flex-wrap items-center gap-2 rounded-md border p-3"
                >
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="text-foreground font-medium">{match.name}</p>
                    <p className="text-muted-foreground">
                      {[match.email, match.phone].filter(Boolean).join(" · ") ||
                        "No contact details"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={create.isPending || match.archivedAt !== null}
                    onClick={() =>
                      submit({
                        kind: "use_existing",
                        personId: match.personId,
                      })
                    }
                  >
                    {match.archivedAt ? "Archived" : "Use this person"}
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                disabled={create.isPending}
                onClick={() =>
                  submit({
                    kind: "create_separate",
                    reviewedPersonIds: preview.data.map(
                      (match) => match.personId,
                    ),
                  })
                }
              >
                Create a separate person
              </Button>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            {!reviewed ? (
              <Button
                disabled={!entityId || !name.trim()}
                onClick={() => setReviewed(true)}
              >
                Review
              </Button>
            ) : preview.data?.length === 0 ? (
              <Button
                busy={create.isPending}
                disabled={create.isPending}
                onClick={() => submit()}
              >
                Add student
              </Button>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
