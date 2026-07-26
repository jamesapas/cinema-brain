import { z } from "zod";

/**
 * Provider-neutral tool definition.
 *
 * Tools are described once with a Zod schema; `jsonSchema` is derived from it so
 * the wire definition and the runtime validation can never drift apart. Swapping
 * LLM providers means changing how these are serialized, not rewriting them.
 */
export type AgentTool = {
  name: string;
  description: string;
  jsonSchema: Record<string, unknown>;
  /** Validates raw model-supplied arguments, then executes. Always returns a string. */
  run: (rawArgs: unknown) => Promise<string>;
};

export function defineTool<Schema extends z.ZodType>(spec: {
  name: string;
  description: string;
  parameters: Schema;
  run: (args: z.infer<Schema>) => Promise<string>;
}): AgentTool {
  const jsonSchema = z.toJSONSchema(spec.parameters) as Record<string, unknown>;
  // `$schema` is metadata the tool-definition endpoints don't want.
  delete jsonSchema.$schema;

  return {
    name: spec.name,
    description: spec.description,
    jsonSchema,
    run: async (rawArgs) => {
      const parsed = spec.parameters.safeParse(rawArgs);
      if (!parsed.success) {
        // Returned as a result rather than thrown: the model can read the
        // problem and retry with corrected arguments, which is the whole point
        // of letting it drive. Throwing would abort the turn instead.
        return JSON.stringify({
          error: "invalid_arguments",
          issues: parsed.error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        });
      }

      try {
        return await spec.run(parsed.data);
      } catch (error) {
        return JSON.stringify({
          error: "tool_failed",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    },
  };
}
