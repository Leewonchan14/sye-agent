"use client";

import { useMemo } from "react";
import { CodeBlockSkeleton, type CustomRendererProps } from "streamdown";

import { parseSyeUiSpec } from "@/lib/ui/spec";
import { CodeBlock, CodeBlockContainer, CodeBlockHeader } from "./code-block";
import { SyeUiBlock } from "./sye-ui-block";

const SyeUiFence = ({ code, isIncomplete }: CustomRendererProps) => {
  const parsed = useMemo(
    () => (isIncomplete ? null : parseSyeUiSpec(code)),
    [code, isIncomplete]
  );

  if (isIncomplete) {
    return (
      <CodeBlockContainer language="ui">
        <CodeBlockHeader>
          <span className="font-mono">ui</span>
          <span>그리는 중…!</span>
        </CodeBlockHeader>
        <CodeBlockSkeleton />
      </CodeBlockContainer>
    );
  }

  if (!parsed?.ok) {
    return (
      <CodeBlock code={code} language="json">
        <CodeBlockHeader>
          <span className="font-mono">ui</span>
          <span>원문으로 보여줄게</span>
        </CodeBlockHeader>
      </CodeBlock>
    );
  }

  return <SyeUiBlock spec={parsed.spec} />;
};

export { SyeUiFence };
