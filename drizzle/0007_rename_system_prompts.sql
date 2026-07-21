ALTER TABLE "system_prompts" RENAME TO "instructions";
ALTER INDEX "system_prompts_active_idx" RENAME TO "instructions_active_idx";
