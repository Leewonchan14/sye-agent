import { tool } from "ai";
import { z } from "zod/v4";

import { invalidateAgent } from "@/lib/agent";
import {
  deleteInstructions,
  listInstructions,
  saveInstructions,
} from "@/lib/db/instructions";

/** 새 지시 사항을 추가합니다. */
export const instructionAdd = tool({
  description:
    "사용자의 요청을 '지시 사항(instruction)'으로 저장합니다. " +
    "저장된 지시 사항은 다음 대화부터 하치와레의 행동 방식에 반영됩니다.\n" +
    "사용자가 아래와 같은 말을 하면 반드시 이 도구를 사용하세요:\n" +
    '- "다음부터는 이렇게 답해줘"\n' +
    '- "이런 식으로 말해줘"\n' +
    '- "앞으로는 이런 스타일로 해줘"\n' +
    '- "이렇게 추천해줘"\n' +
    '- "기억해줘"\n\n' +
    "label에는 '말투 규칙', '데이트 스타일', '추천 방식' 같은 짧은 이름을," +
    "content에는 구체적인 지시 내용을 적어주세요." +
    "content는 사용자가 말한 그대로를 최대한 보존해서 저장하세요.",
  inputSchema: z.object({
    label: z
      .string()
      .min(1)
      .max(50)
      .describe(
        "지시 사항의 이름. '말투 규칙', '데이트 스타일', '추천 방식', '금지 사항' 등 짧고 알아보기 쉬운 이름 (최대 50자)"
      ),
    content: z
      .string()
      .min(1)
      .describe(
        "구체적인 지시 내용. 사용자가 말한 방식을 자세히 기록합니다. '항상 ~하게', '~는 하지 말 것', '~ 위주로' 같은 구체적인 표현 포함."
      ),
  }),
  execute: async ({ label, content }) => {
    const instruction = await saveInstructions(label.trim(), content.trim());
    invalidateAgent();
    return `"${instruction.label}" 지시 사항이 저장되었습니다. (id: ${instruction.id}, 활성)\n다음 대화부터 이 지시 사항이 하치와레에게 반영됩니다.`;
  },
});

/** 기존 지시 사항을 수정합니다. */
export const instructionEdit = tool({
  description:
    "이미 저장된 지시 사항의 이름(label)이나 내용(content)을 변경합니다.\n" +
    "사용자가 '아까 저장한 거 수정해줘', '이 부분을 바꿔줘' 같은 말을 할 때 사용하세요.\n" +
    "id는 instruction_list로 확인할 수 있습니다.\n" +
    "수정 후에는 다음 대화부터 변경사항이 반영됩니다.",
  inputSchema: z.object({
    id: z
      .number()
      .describe(
        "수정할 지시 사항의 id. instruction_list로 확인 가능합니다."
      ),
    label: z
      .string()
      .min(1)
      .max(50)
      .describe("변경할 이름 (최대 50자)"),
    content: z
      .string()
      .min(1)
      .describe("변경할 구체적인 지시 내용"),
  }),
  execute: async ({ id, label, content }) => {
    const instruction = await saveInstructions(label.trim(), content.trim(), id);
    invalidateAgent();
    return `"${instruction.label}" 지시 사항이 수정되었습니다. (id: ${instruction.id})\n다음 대화부터 수정된 내용이 반영됩니다.`;
  },
});

/** 지시 사항을 삭제합니다. */
export const instructionDelete = tool({
  description:
    "저장된 지시 사항을 삭제합니다.\n" +
    "사용자가 '저장한 거 삭제해줘', '그 규칙 지워줘', '없애줘' 같은 말을 할 때 사용하세요.\n" +
    "삭제된 지시 사항은 복구할 수 없습니다.\n" +
    "삭제 전에 꼭 사용자에게 어떤 지시 사항을 삭제할지 확인을 받으세요.",
  inputSchema: z.object({
    id: z
      .number()
      .describe(
        "삭제할 지시 사항의 id. instruction_list로 확인 가능합니다."
      ),
  }),
  execute: async ({ id }) => {
    const all = await listInstructions();
    const target = all.find((i) => i.id === id);
    await deleteInstructions(id);
    invalidateAgent();
    const name = target ? `"${target.label}"` : `id ${id}`;
    return `${name} 지시 사항이 삭제되었습니다. 복구할 수 없습니다.`;
  },
});

/** 등록된 모든 지시 사항을 조회합니다. */
export const instructionList = tool({
  description:
    "현재 저장된 모든 지시 사항을 조회합니다.\n" +
    "사용자가 '내가 등록한 거 뭐 있어?', '저장된 규칙 보여줘', '목록 볼래' 같은 말을 할 때 사용하세요.\n" +
    "목록에서 각 지시 사항의 id, 이름, 활성 상태, 내용 일부를 확인할 수 있습니다.\n" +
    "id는 instruction_edit이나 instruction_delete에서 대상을 지정할 때 필요합니다.",
  inputSchema: z.object({}),
  execute: async () => {
    const all = await listInstructions();
    if (all.length === 0) {
      return "아직 등록된 지시 사항이 없습니다.\n사용자가 '다음부터 이렇게 해줘' 같은 말을 하면 instruction_add로 저장해주세요.";
    }
    const lines = all.map((i) => {
      const status = i.isActive ? "✅ 활성" : "⏸️ 비활성";
      const preview =
        i.content.length <= 80
          ? i.content
          : i.content.slice(0, 77) + "...";
      return `[${i.id}] ${i.label} (${status})\n   → ${preview}`;
    });
    return (
      `📋 등록된 지시 사항 (${all.length}개)\n` +
      lines.join("\n") +
      "\n\nid를 확인하려면 instruction_edit/edit_delete에 전달하세요."
    );
  },
});
