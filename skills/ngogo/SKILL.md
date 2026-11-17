---
name: ngogo
description: Use when someone asks who is overloaded, cornered or piled-on in a Jira project, why a Jira request is "held in incubation" by Ngogo, what Ngogo is holding, or wants to release a held request. Requires the Ngogo for Jira MCP server (tools who-is-cornered, request-encirclement, held-requests, release-request, advance-what-if).
license: MIT
---

# Ngogo: the balance of power around each person in Jira

In the Ngogo forest, chimpanzees attack when they outnumber a victim eight to one. Teams do the same thing
politely, with due dates: many independent requesters converge on one person who has few people helping.
Ngogo for Jira counts that balance of power and holds the request too many instead of piling it on.
This skill tells an agent how to use Ngogo's tools and how to talk about what they return.

## Connecting

Ngogo is a Forge app. Once a site admin has turned its tools on for outside clients
(Atlassian Administration > Apps > Sites > the site > Connected apps > Ngogo > Tools),
connect any MCP client to `https://mcp.atlassian.com/forge/<appId>` and sign in with OAuth.
Every call then runs with the signed-in person's own Jira rights: the tools never return a request that person may not browse.

## What the numbers mean

- **Source**: one independent requester with an open request on a person. A queue fed by automation counts as one source.
- **Ally**: someone other than the requester who acted on that person's open requests in the last 14 days.
- **Ratio** = urgency-weighted sources / (1 + allies). An overdue request or one due within 3 days weighs 1.0;
  further due dates weigh less; no due date weighs 0.5.
- **State**: calm below 3.00, wary from 3.00, cornered from 8.00. Eight to one is a prudential default and a setting,
  not a published measurement. Say so if asked.
- **Incubation**: when a request lands on a cornered person, Ngogo holds it for 48 hours, explains why on the request,
  and proposes the calmest colleague as an ally. Nothing is refused or deleted. A hold ends when someone releases it,
  when the person is no longer cornered, when the request is reassigned, or after 48 hours.

## Tools

| Tool | Use it for | Inputs |
|---|---|---|
| `who-is-cornered` | Everyone with open work in a project, most cornered first | `projectKey` (e.g. `OPS`) |
| `request-encirclement` | One request: who it lands on, their ratio, which source it comes from, whether it is held and why | `issueKey` (e.g. `OPS-12`) |
| `held-requests` | What Ngogo holds in incubation now | `projectKey` (optional) |
| `release-request` | Release one held request. **Writes to Jira.** | `issueKey` |
| `advance-what-if` | Would an invoice-advance pool advance cash on an invoice (Ferret decision engine, play numbers, nothing stored) | `poolCapital`, `face`, `advance`, `daysUntilDue`, optional `fee`, `debtorAlreadyOwes`, `afterADefault` |

Every answer is a small JSON object with `ok`, a one-sentence `summary`, and details. If `ok` is false, `error` says what is missing.
If `incomplete` is true, Jira had more than Ngogo read: the real pressure is at least that high.

## How to answer

1. Call a tool for every fact. Never invent a ratio, a count, a name or a date.
2. Start from the tool's `summary`, then give the two or three numbers that matter.
3. The index exists to protect people, never to rank them. Do not call a cornered person slow or underperforming,
   and do not blame requesters: each request is legitimate, it is the sum that corners. Do not present the list as a league table.
4. End with what would help: `ratio_with_one_more_ally` tells you what one more person acting alongside would change;
   moving a due date helps too. If nobody nearby is calm, say it is a staffing question, not a routing one.
5. Call `release-request` only when the person explicitly asks to release a specific request, and say afterwards that
   the assignee was cornered when it was held, so finding an ally is still worth it.
6. `advance-what-if` is a simulation on a pool described in the question. Always say no pool is stored and no money moves.

## Examples

- "Who is cornered in OPS?" → `who-is-cornered {projectKey: "OPS"}` → "In OPS, 1 person is cornered (Nadia) and 3 are wary,
  out of 12. Nadia: 10 independent sources, no ally, 8.70 to 1. One ally would bring it to 4.35."
- "Why is OPS-61 stuck?" → `request-encirclement {issueKey: "OPS-61"}` → quote the hold notice and the proposed ally.
- "Release OPS-61." → `release-request {issueKey: "OPS-61"}`.
