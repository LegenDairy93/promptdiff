# OpenRouter comparison

This example runs two prompt versions through OpenRouter against the same cases and stores each result as a normal PromptDiff artifact.

Set the key, then run both targets:

~~~powershell
$env:OPENROUTER_API_KEY="your-key"
node dist/cli.js run -c examples/openrouter-comparison/promptdiff.config.yml -t baseline
node dist/cli.js run -c examples/openrouter-comparison/promptdiff.config.yml -t candidate
node dist/cli.js diff previous latest
node dist/cli.js report previous latest -o openrouter-report.html --projected-calls 100000
~~~

The example uses `openrouter/auto-beta`. Replace it with explicit OpenRouter model slugs when you need the model identity held constant. To compare two models as well as two prompts, set a different model under each target.


The projection is an explicit traffic assumption. The per-run token and cost totals come from the two recorded OpenRouter artifacts.
