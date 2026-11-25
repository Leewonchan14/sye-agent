"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useCallback } from "react";

import type { UIMessage } from "ai";

interface UseSessionSidebarSyncOptions {
  sessionId: string;
  token: string;
}

/**
 * useMutation that saves session state (with snapshot + rollback + invalidation).
 */
export const useSessionSidebarSync = ({
  sessionId,
  token,
}: UseSessionSidebarSyncOptions) => {
  const queryClient = useQueryClient();

  const saveSessionMutation = useMutation({
    mutationFn: async (messages: UIMessage[]) => {
      const r = await fetch("/api/sessions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-token": token,
        },
        body: JSON.stringify({ sessionId, messages }),
      });
      if (!r.ok) throw new Error("Failed to save session state");
      return r.json();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      const previousData = queryClient.getQueryData(["sessions"]);
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["sessions"], context.previousData);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });

  const handleFinish = useCallback(
    ({ messages }: { messages: UIMessage[] }) => {
      saveSessionMutation.mutate(messages);
    },
    [saveSessionMutation]
  );

  return { handleFinish };
};
