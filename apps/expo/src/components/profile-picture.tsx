import { useState } from "react";
import { View } from "react-native";
import { fetch } from "expo/fetch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";

import { FILE_RULES, fitWithin } from "@matops/domain";

import { Avatar } from "~/components/avatar";
import { useToast } from "~/components/toast";
import {
  Button,
  confirm,
  List,
  Muted,
  SectionHeading,
  Stack,
  Txt,
} from "~/components/ui";
import { trpc } from "~/utils/api";

const FALLBACK = "Couldn't save the photo. Try again.";

async function loadNative() {
  // Imported on demand so a dev client built before these modules were added
  // still opens the Profile tab.
  const [picker, manipulator, fs] = await Promise.all([
    import("expo-image-picker"),
    import("expo-image-manipulator"),
    import("expo-file-system"),
  ]);
  return { picker, manipulator, fs };
}

async function pickJpeg(): Promise<Uint8Array | null> {
  const { picker, manipulator, fs } = await loadNative();
  const result = await picker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 1,
  });
  const asset = result.canceled ? undefined : result.assets[0];
  if (!asset) return null;
  const size = fitWithin(
    asset.width,
    asset.height,
    FILE_RULES.avatar.maxImageEdge,
  );
  const image = await manipulator.ImageManipulator.manipulate(asset.uri)
    .resize(size)
    .renderAsync();
  const saved = await image.saveAsync({
    format: manipulator.SaveFormat.JPEG,
    compress: 0.85,
  });
  return new fs.File(saved.uri).bytes();
}

export function ProfilePicture({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const academy = useQuery(trpc.academy.current.queryOptions()).data;
  const createUpload = useMutation(trpc.storage.createUpload.mutationOptions());
  const completeUpload = useMutation(
    trpc.storage.completeUpload.mutationOptions(),
  );
  const removeAvatar = useMutation(trpc.storage.removeAvatar.mutationOptions());
  const [busy, setBusy] = useState(false);

  if (!academy) return null;
  const { avatarUrl, uploadsEnabled } = academy;
  if (!uploadsEnabled && avatarUrl === null) return null;

  const refresh = () =>
    queryClient.invalidateQueries(trpc.academy.current.queryFilter());

  const fail = (err: unknown) =>
    toast.show(
      err instanceof TRPCClientError && err.message ? err.message : FALLBACK,
    );

  const upload = async () => {
    setBusy(true);
    try {
      const bytes = await pickJpeg();
      if (!bytes) return;
      const started = await createUpload.mutateAsync({
        kind: "avatar",
        contentType: "image/jpeg",
        sizeBytes: bytes.byteLength,
      });
      const put = await fetch(started.url, {
        method: "PUT",
        headers: started.headers,
        body: bytes,
        credentials: "omit",
      });
      if (!put.ok) throw new Error(`Upload failed with ${put.status}`);
      await completeUpload.mutateAsync({ fileId: started.fileId });
      await refresh();
      toast.show("Photo saved");
    } catch (err) {
      fail(err);
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    confirm({
      title: "Remove your photo?",
      message: "People at your academy will see your initials instead.",
      confirmLabel: "Remove",
      onConfirm: () => {
        setBusy(true);
        removeAvatar.mutate(undefined, {
          onSuccess: () => {
            toast.show("Photo removed");
            void refresh();
          },
          onError: fail,
          onSettled: () => setBusy(false),
        });
      },
    });

  const hasImage = avatarUrl !== null;

  return (
    <Stack gap={16}>
      <SectionHeading>Profile picture</SectionHeading>
      <List>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 16,
            padding: 16,
          }}
        >
          <Avatar
            src={avatarUrl}
            name={name}
            email={email}
            size={56}
            label={hasImage ? "Your profile picture" : "Your initials"}
          />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt size={15} weight={500}>
              Photo
            </Txt>
            <Muted>People at your academy see it next to your name.</Muted>
          </View>
        </View>
        {uploadsEnabled ? (
          <Stack row gap={8} style={{ padding: 16 }}>
            <Button
              label={hasImage ? "Replace" : "Upload"}
              variant="outline"
              loading={busy && !removeAvatar.isPending}
              disabled={busy}
              accessibilityLabel={
                hasImage
                  ? "Replace your profile picture"
                  : "Upload a profile picture"
              }
              onPress={() => void upload()}
            />
            {hasImage ? (
              <Button
                label="Remove"
                variant="ghost"
                loading={removeAvatar.isPending}
                disabled={busy}
                accessibilityLabel="Remove your profile picture"
                onPress={remove}
              />
            ) : null}
          </Stack>
        ) : null}
      </List>
    </Stack>
  );
}
