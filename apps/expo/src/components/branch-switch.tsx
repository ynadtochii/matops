import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useToast } from "~/components/toast";
import { Button, Eyebrow, Stack, Txt, useTheme } from "~/components/ui";
import { trpc } from "~/utils/api";
import { authClient } from "~/utils/auth";
import { setActiveEntity } from "~/utils/entity-store";

interface Branch {
  academyId: string;
  organizationId: string;
  name: string;
}

/**
 * Switching branch, in one place (ADR 129).
 *
 * It used to live inside Profile, which is not where anybody compares two
 * schedules. The behaviour moves here so the header and any other caller run
 * the same steps in the same order, rather than two copies that drift on the
 * failure path.
 *
 * The selection is committed LAST. A branch in another organization needs the
 * session moved first, and writing the new branch to secure store before that
 * succeeds leaves the app naming a place the session cannot open. On failure
 * nothing has changed and the member is told.
 *
 * The cache is RESET rather than invalidated, because every cached answer
 * belonged to the branch being left: invalidating leaves it on screen until the
 * refetch lands, so the gym's schedule shows the mat's classes for a moment
 * (ADR 126). Reset also refetches what is mounted, which removing does not: a
 * removed query leaves its observer holding the last branch's data with nothing
 * to make it ask again.
 */
function useBranchSwitch() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { data: session } = authClient.useSession();
  const branches = useQuery(trpc.academy.listMineStudent.queryOptions());
  const current = useQuery(trpc.academy.current.queryOptions());

  const setActive = useMutation(trpc.academy.setActive.mutationOptions());

  const switchTo = async (branch: Branch) => {
    if (branch.academyId === current.data?.academyId) return;
    const sameOrganization =
      branch.organizationId === session?.session.activeOrganizationId;
    try {
      if (!sameOrganization) {
        await setActive.mutateAsync({ academyId: branch.academyId });
      }
      setActiveEntity(branch.academyId);
      await queryClient.resetQueries();
    } catch (error) {
      toast.show(
        error instanceof Error
          ? error.message
          : "Couldn't open that branch. You are still at the last one.",
      );
    }
  };

  return {
    branches: branches.data ?? [],
    activeId: current.data?.academyId,
    activeName: current.data?.name ?? null,
    busy: setActive.isPending,
    switchTo,
  };
}

/** The list itself, as a sheet. Nothing is drawn for a one-branch member. */
function BranchSwitchSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const t = useTheme();
  const { branches, activeId, busy, switchTo } = useBranchSwitch();

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close"
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: "flex-end",
          backgroundColor: t.backdrop,
        }}
      >
        <View
          style={{
            backgroundColor: t.floating,
            borderTopLeftRadius: 12,
            borderTopRightRadius: 12,
            padding: 16,
            paddingBottom: 32,
            gap: 12,
          }}
        >
          <Eyebrow>Your branches</Eyebrow>
          <Stack gap={4}>
            {branches.map((b) => {
              const isActive = b.academyId === activeId;
              return (
                <Pressable
                  key={b.academyId}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${b.name}`}
                  accessibilityState={{
                    selected: isActive,
                    disabled: isActive || busy,
                  }}
                  disabled={isActive || busy}
                  onPress={() => {
                    void switchTo(b).then(onClose);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    minHeight: 44,
                    borderRadius: 8,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: isActive ? t.active : t.surface1,
                  }}
                >
                  <Txt
                    size={15}
                    weight={isActive ? 500 : 400}
                    tone={isActive ? "default" : "secondary"}
                  >
                    {b.name}
                  </Txt>
                  {isActive && (
                    <Txt size={15} tone="default">
                      ✓
                    </Txt>
                  )}
                </Pressable>
              );
            })}
          </Stack>
          <Button label="Close" variant="outline" onPress={onClose} />
        </View>
      </Pressable>
    </Modal>
  );
}

/**
 * The branch name in the header, which opens the picker when there is a choice
 * (ADR 129). A member of one branch reads a plain name and is offered nothing,
 * because a picker with one row is a control that does nothing.
 */
export function BranchName() {
  const [open, setOpen] = useState(false);
  const { branches, activeName } = useBranchSwitch();
  const label = activeName ?? "MatOps";

  if (branches.length < 2) {
    return (
      <Txt size={15} weight={500} numberOfLines={1}>
        {label}
      </Txt>
    );
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}. Switch branch`}
        onPress={() => setOpen(true)}
        hitSlop={8}
      >
        <Txt size={15} weight={500} numberOfLines={1}>
          {label} ▾
        </Txt>
      </Pressable>
      <BranchSwitchSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
