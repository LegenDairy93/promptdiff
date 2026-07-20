let input = "";
for await (const chunk of process.stdin) input += chunk;
const request = JSON.parse(input);
const text = request.case.input.toLowerCase();
if (text.includes("classify") || text.includes("charged twice")) {
  const output = JSON.stringify({ category: "billing", priority: "medium" });
  process.stdout.write(JSON.stringify({ output, trace: [
    { type: "model", output: "Classify the request using the required contract." },
    { type: "final", output }
  ] }));
} else {
  const output = "Refund requests after 40 days are outside the standard window, but support can review an exception.";
  process.stdout.write(JSON.stringify({ output, trace: [
    { type: "model", output: "I need the refund policy before answering." },
    { type: "tool", name: "lookup_refund_policy", input: { days_since_purchase: 40 }, output: { standard_window_days: 30, exceptions: "manual review" } },
    { type: "model", output: "The standard window passed; offer review without a guarantee." },
    { type: "final", output }
  ] }));
}
