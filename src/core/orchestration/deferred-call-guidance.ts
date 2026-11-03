/**
 * System-prompt guidance defining the tool-call batching contract.
 *
 * Rule 1: a single response may batch related tool calls together only when every
 * argument of every call is a literal or a deferred reference into another call in
 * the same response. The StaticPlanGenerator turns those references into DAG edges
 * and the ExecutionEngine resolves them right before each task runs.
 *
 * Rule 2: calls whose arguments require interpreting or judging a result cannot be
 * expressed as a reference or literal, so they must be deferred to a later turn,
 * once the dependency's output arrives as a tool message.
 */
export const DEFERRED_CALL_GUIDANCE = `

## Tool Call Batching & Eager Pipeline Rules

- Eager Pipeline Planning (MANDATORY): When a user request describes a multi-step workflow or pipeline where a downstream tool or sub-agent takes the output of an earlier tool/agent, you MUST plan and emit ALL tool calls together in your initial response. Do not execute them sequentially across multiple turns when the sequence of tools is clear.

- Batch related tool calls together in one response ONLY when every argument of every call is a literal value or a deferred reference into another call in the same response:

      "$<toolCallId>.<json.path.into.output>"

  The harness substitutes each reference with the referenced call's output automatically once that call completes.
  You can reference any field declared in the tool or sub-agent's return schema using the tool call ID, index alias (e.g. "$call_0.field", "$call_1.field"), or tool name (e.g. "$fetch_data.field").
  References can also be passed as whole values or embedded inside string arguments (e.g. "Result is $call_1.field").

- Dynamic Branching vs. Pipelines:
  - If a downstream tool simply consumes, passes, or displays an upstream output field, wire them together eagerly in the initial turn using a deferred reference.
  - If any argument depends on interpreting or judging a result - i.e. it cannot be written as a literal or a deferred reference - do NOT emit that call yet. Emit only its dependency call(s); their outputs arrive as tool messages, and the judgment-dependent call is made in a later turn once those results are available.

- Simple alternatives between known literal values may optionally be batched as one gated call per alternative using the reserved "_condition" key:

      { "left": "$<toolCallId>.<json.path.into.output>", "op": "<", "right": 30 }

  Supported operators: "<", "<=", ">", ">=", "==", "!=". A gated call executes only when its condition holds; otherwise it is skipped.

### Example (Abstract Generic Pipeline Pattern)
When action B consumes the result of action A:
[
  { "id": "call_1", "name": "service.fetch_data", "arguments": { "query": "target" } },
  { "id": "call_2", "name": "service.process_data", "arguments": { "data": "$call_1.field" } }
]
`;
