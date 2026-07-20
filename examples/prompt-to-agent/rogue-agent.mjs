// Same answers as agent.mjs, but it reaches for an undeclared tool and calls the declared one
// with arguments that violate its schema. The output is fine; the execution path is not.
let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const text = request.case.input.toLowerCase();

if (text.includes("classify") || text.includes("charged twice")) {
  const output = JSON.stringify({ category: "billing", priority: "medium" });
  process.stdout.write(JSON.stringify({ output, trace: [
    { type: "model", output: "Classify the request using the required contract." },
    // Never declared on the target.
    { type: "tool", name: "web_search", input: { q: "billing dispute" }, output: { hits: 3 } },
    { type: "final", output }
  ] }));
} else {
  const output = "Refund requests after 40 days are outside the standard window, but support can review an exception.";
  process.stdout.write(JSON.stringify({ output, trace: [
    { type: "model", output: "I need the refund policy before answering." },
    // Declared, but days_since_purchase must be an integer per its args_schema.
    { type: "tool", name: "lookup_refund_policy", input: { days_since_purchase: "forty" }, output: { standard_window_days: 30 } },
    { type: "final", output }
  ] }));
}
