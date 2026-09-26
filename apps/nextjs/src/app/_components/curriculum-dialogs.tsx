"use client";

import type { ReactNode } from "react";

import { BLOCK_WEEK_CHOICES, MAX_TRACK_NAME_LENGTH } from "@matops/domain";
import { Button } from "@matops/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@matops/ui/dialog";
import { FieldError } from "@matops/ui/field";
import { Input } from "@matops/ui/input";
import { Label } from "@matops/ui/label";
import { Select } from "@matops/ui/select";
import { Textarea } from "@matops/ui/textarea";

import { chipClass, weeksLabel } from "./curriculum-shared";

const NEW_CATEGORY = "__new";

export interface BlockForm {
  id: string | null;
  theme: string;
  defaultWeeks: number;
  notes: string;
  category: string;
  creating: boolean;
}

export interface RunNoteForm {
  placementId: string;
  theme: string;
  note: string;
}

export interface TrackForm {
  id: string | null;
  name: string;
}

interface DialogProps<T> {
  form: T | null;
  saving: boolean;
  onChange: (form: T) => void;
  onClose: () => void;
}

/** A dialog that is open exactly while its form state exists, and hands the
 *  non-null form to its body so nothing downstream has to re-check it. */
function FormDialog<T>({
  form,
  onClose,
  children,
}: {
  form: T | null;
  onClose: () => void;
  children: (form: T) => ReactNode;
}) {
  return (
    <Dialog open={form !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>{form !== null && children(form)}</DialogContent>
    </Dialog>
  );
}

export function BlockDialog({
  form: state,
  categories,
  saving,
  onChange,
  onClose,
  onSubmit,
  themeError,
}: DialogProps<BlockForm> & {
  categories: string[];
  onSubmit: () => void;
  themeError?: string;
}) {
  return (
    <FormDialog form={state} onClose={onClose}>
      {(form) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          <DialogTitle>{form.id ? "Edit block" : "New block"}</DialogTitle>
          <DialogDescription>
            {form.id
              ? "This block keeps its place on the plan. Renaming it renames it everywhere it appears."
              : "A block is a theme you can put on the plan as often as you like."}
          </DialogDescription>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-theme">Theme</Label>
            <Input
              id="block-theme"
              value={form.theme}
              onChange={(e) => onChange({ ...form, theme: e.target.value })}
              placeholder="Closed guard: attacks and retention"
              maxLength={80}
              required
              aria-invalid={themeError ? true : undefined}
              aria-describedby={themeError ? "block-theme-error" : undefined}
            />
            {themeError && (
              <FieldError id="block-theme-error">{themeError}</FieldError>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-category">Category</Label>
            <Select
              id="block-category"
              value={form.creating ? NEW_CATEGORY : form.category}
              onChange={(e) => {
                const picked = e.target.value;
                onChange({
                  ...form,
                  creating: picked === NEW_CATEGORY,
                  category: picked === NEW_CATEGORY ? "" : picked,
                });
              }}
            >
              <option value="">No category</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value={NEW_CATEGORY}>New category…</option>
            </Select>
            {form.creating && (
              <Input
                aria-label="New category name"
                value={form.category}
                onChange={(e) =>
                  onChange({ ...form, category: e.target.value })
                }
                placeholder="Guard, Passing, Takedowns…"
                maxLength={40}
                autoComplete="off"
                autoFocus
              />
            )}
            <p className="text-muted-foreground text-xs">
              Pick one you already use, or add a new one. A block does not have
              to have a category.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Usually runs</Label>
            <div className="flex flex-wrap gap-1.5">
              {BLOCK_WEEK_CHOICES.map((weeks) => (
                <button
                  key={weeks}
                  type="button"
                  aria-pressed={form.defaultWeeks === weeks}
                  onClick={() => onChange({ ...form, defaultWeeks: weeks })}
                  className={chipClass(form.defaultWeeks === weeks)}
                >
                  {weeksLabel(weeks)}
                </button>
              ))}
            </div>
            <p className="text-muted-foreground text-xs">
              The length it takes when you drop it on the plan. You can change
              it there without changing the block.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="block-notes">Notes</Label>
            <Textarea
              id="block-notes"
              value={form.notes}
              onChange={(e) => onChange({ ...form, notes: e.target.value })}
              placeholder="What this block covers, week by week."
              maxLength={2000}
              rows={4}
              className="min-h-24 resize-y"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" busy={saving}>
              {form.id ? "Save changes" : "Add block"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </FormDialog>
  );
}

export function RunNoteDialog({
  form: state,
  saving,
  onChange,
  onClose,
  onSubmit,
}: DialogProps<RunNoteForm> & { onSubmit: (form: RunNoteForm) => void }) {
  return (
    <FormDialog form={state} onClose={onClose}>
      {(form) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
        >
          <DialogTitle>This run of {form.theme}</DialogTitle>
          <DialogDescription>
            What these weeks are doing about it, with this group. It stays on
            this run only: the block keeps its own notes, and every other run of
            it is untouched. You can still write here after the weeks have
            passed, so this is also where "what we actually covered" goes.
          </DialogDescription>

          <Textarea
            aria-label={`Notes for this run of ${form.theme}`}
            value={form.note}
            onChange={(e) => onChange({ ...form, note: e.target.value })}
            placeholder="Far-side underhook only. Comp team joins from week 2."
            maxLength={2000}
            rows={5}
            autoFocus
            className="min-h-28 resize-y"
          />

          <div className="flex gap-2">
            <Button type="submit" busy={saving}>
              Save
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </FormDialog>
  );
}

export function TrackDialog({
  form: state,
  saving,
  onChange,
  onClose,
  onSubmit,
}: DialogProps<TrackForm> & { onSubmit: (name: string) => void }) {
  return (
    <FormDialog form={state} onClose={onClose}>
      {(form) => (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const name = form.name.trim();
            if (name) onSubmit(name);
          }}
        >
          <DialogTitle>{form.id ? "Rename track" : "New track"}</DialogTitle>
          <DialogDescription>
            A track is one plan, with its own run of weeks. Fundamentals and
            No-gi can work through different themes at the same time, out of the
            same block library.
          </DialogDescription>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="track-name">Name</Label>
            <Input
              id="track-name"
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              placeholder="Fundamentals"
              maxLength={MAX_TRACK_NAME_LENGTH}
              required
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="submit" busy={saving}>
              {form.id ? "Save changes" : "Add track"}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </FormDialog>
  );
}
