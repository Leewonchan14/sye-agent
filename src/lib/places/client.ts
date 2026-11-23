import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAuthStore } from "@/lib/auth-store";
import { ledgerKeys, ledgerRequest } from "@/lib/ledger/client";
import type { PlaceNote, PlaceNoteInput } from "@/lib/places/types";

export const placeKeys = {
  all: ["places"] as const,
};

/** 별점·리뷰를 저장하고, 별점을 보여 주는 화면(데이트 지도 등)을 다시 읽는다. */
export const useSavePlaceNote = () => {
  const token = useAuthStore((s) => s.token) ?? "";
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PlaceNoteInput) =>
      ledgerRequest<PlaceNote>(token, "/api/places/notes", {
        method: "PUT",
        body: input,
      }),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ledgerKeys.all }),
        queryClient.invalidateQueries({ queryKey: placeKeys.all }),
      ]),
  });
};
