import { createServer } from "node:http";

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || !["/baseline", "/candidate"].includes(request.url ?? "")) {
    response.writeHead(404).end();
    return;
  }
  let raw = "";
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw);
  const message = String(body.message ?? "").toLowerCase();
  const category = message.includes("charged") ? "billing" : message.includes("password") ? "account" : "general";
  const result = request.url === "/baseline"
    ? { category }
    : { category, priority: category === "billing" ? "high" : "medium", reason: "Rule-backed routing contract" };
  response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ result }));
});

server.listen(4319, "127.0.0.1", () => console.log("Ticket router listening on http://127.0.0.1:4319"));