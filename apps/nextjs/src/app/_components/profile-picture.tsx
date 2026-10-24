"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "~/trpc/react";
import { Avatar } from "./avatar";
import { useEntity } from "./entity";
import { ImageUploadRow } from "./image-upload-row";
import { LIST, SectionHeading } from "./primitives";

export function ProfilePicture({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { avatarUrl, uploadsEnabled } = useEntity();
  const removeAvatar = useMutation(trpc.storage.removeAvatar.mutationOptions());

  if (!uploadsEnabled && avatarUrl === null) return null;
  return (
    <section className="flex flex-col gap-4" aria-label="Profile picture">
      <SectionHeading>Profile picture</SectionHeading>
      <div className={LIST}>
        <ImageUploadRow
          kind="avatar"
          title="Photo"
          description="People at your academy see it next to your name."
          preview={
            <Avatar
              src={avatarUrl}
              name={name}
              email={email}
              className="text-md size-12"
            />
          }
          hasImage={avatarUrl !== null}
          onRemove={async () => {
            await removeAvatar.mutateAsync();
            await queryClient.invalidateQueries(
              trpc.academy.current.queryFilter(),
            );
          }}
        />
      </div>
    </section>
  );
}
