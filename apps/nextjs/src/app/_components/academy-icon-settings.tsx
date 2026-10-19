"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { AcademyIcon } from "./avatar";
import { ImageUploadRow } from "./image-upload-row";
import { LIST, SectionHeading } from "./primitives";

export function AcademyIconSettings({
  name,
  iconUrl,
}: {
  name: string;
  iconUrl: string | null;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const removeIcon = useMutation(trpc.storage.removeIcon.mutationOptions());

  return (
    <section className="flex flex-col gap-4">
      <SectionHeading>Academy icon</SectionHeading>
      <div className={LIST}>
        <ImageUploadRow
          kind="academy_icon"
          title="Icon"
          description="Shown in the sidebar and on your join, drop-in and front desk pages. Square images look best."
          preview={
            <AcademyIcon
              src={iconUrl}
              name={name}
              className="text-md size-12"
            />
          }
          hasImage={iconUrl !== null}
          onRemove={async () => {
            await removeIcon.mutateAsync();
            await queryClient.invalidateQueries(
              trpc.academy.current.queryFilter(),
            );
          }}
        />
      </div>
    </section>
  );
}
