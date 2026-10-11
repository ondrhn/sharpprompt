# sharpprompt token overhead

Window 2026-10-09T19:40:00.000Z to 2026-10-11T19:00:00.000Z.

| tokens | sharpprompt | sessions | sharpprompt / sessions |
|---|---|---|---|
| input (outside the cache) | 187,635 | 3,916 | 4791.50% |
| output | 12,059 | 592,724 | 2.03% |
| cache read | 11,369,359 | 153,014,354 | 7.43% |
| cache write | 291,670 | 2,320,830 | 12.57% |
| API price, USD | 8.5976 | 73.9367 | 11.63% |

Prompts typed: 63; passed by the gate 11; classified 52; rewrites 40; forks finished after losing the race 15.
Per typed prompt: 188,265 tokens, 0.13647 USD.
Per rewrite: 296,104 tokens in the rewrite calls, of which cache read 96.09% of the input side.
Sessions: 615 API requests in interactive sessions; 0 rows from `claude -p` runs and 1 excluded project folders left out.

Notes:
- The fork rereads the whole conversation from the prompt cache, so its cache read count is large; at the cache read price it costs about a tenth of the same input outside the cache, which is why the USD line is the one to read.
- Classify tokens are an estimate (250 + 1.4 per word in, 8 out, on claude-haiku-5-5): the engine's classify returns no usage. They are 16,141 in and 416 out here, 0.0018 USD.
- 28 plugin records have no time (written before timestamps were kept) and are left out.
- On a Max plan the usage limit is not a token count; this is what the same use would cost on the API, not a share of the plan's limit.
