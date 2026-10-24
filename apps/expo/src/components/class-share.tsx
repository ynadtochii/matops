import { Platform, Share } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Share2 } from "lucide-react-native";

import {
  dropInPath,
  VISITOR_LINK_DAYS,
  visitorClassState,
} from "@matops/domain";

import { useToast } from "~/components/toast";
import { Button, IconButton, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";
import { getBaseUrl } from "~/utils/base-url";

interface ShareableClass {
  id: string;
  title: string;
  status: "scheduled" | "cancelled";
  startsAt: Date | string;
  durationMinutes: number;
}

export function ClassShare({
  cls,
  iconOnly = false,
}: {
  cls: ShareableClass;
  iconOnly?: boolean;
}) {
  const t = useTheme();
  const toast = useToast();
  const academy = useQuery(trpc.academy.current.queryOptions()).data;
  const shareable =
    academy?.status === "active" &&
    visitorClassState(
      { ...cls, startsAt: new Date(cls.startsAt) },
      new Date(),
      academy.timeZone ?? "UTC",
      VISITOR_LINK_DAYS,
    ) !== null;
  const link = useQuery(
    trpc.dropIn.link.queryOptions(undefined, { enabled: shareable }),
  );

  if (!shareable) return null;
  if (link.isError) {
    return (
      <Button
        label="Retry link"
        variant="ghost"
        accessibilityLabel={`Retry the friend link for ${cls.title}`}
        onPress={() => void link.refetch()}
      />
    );
  }
  const data = link.data;
  if (!data) return null;

  const share = async () => {
    try {
      const url = `${getBaseUrl()}${dropInPath(data.token, data.sharedBy, cls.id)}`;
      await Share.share(Platform.OS === "ios" ? { url } : { message: url });
    } catch {
      toast.show("Couldn't share the link. Try again.");
    }
  };

  if (iconOnly) {
    return (
      <IconButton
        label={`Share a link for a friend to join ${cls.title}`}
        onPress={() => void share()}
      >
        <Share2 size={18} color={t.mutedForeground} />
      </IconButton>
    );
  }
  return (
    <Button
      label="Share link for a friend"
      variant="ghost"
      icon={<Share2 size={16} color={t.mutedForeground} />}
      onPress={() => void share()}
    />
  );
}
