# Ngogo for Jira

*It counts the ratio and turns the coalition into a symbiosis.*

In the Ngogo forest, in Uganda, chimpanzees attack when they heavily outnumber a victim. Food is not short;
the attack happens because the balance of power makes it safe. Teams do the same thing politely, with due dates:
nine people each send one legitimate request to the same colleague, all for Friday. Nobody means harm. The sum corners.

**Ngogo for Jira** counts that balance of power around each person, shows it at the moment it becomes dangerous,
holds the request too many instead of piling it on, and proposes an ally. Nobody is eliminated; the pile-on becomes a turn.

Built for [Codegeist 2026](https://codegeist2026.devpost.com), category **Apps for Business Teams**,
bonus categories **Best Agents** and **Best app with Atlassian MCP**. A Forge app for Jira and Jira Service Management,
eligible for *Runs on Atlassian* (no egress, no outside service).

## What it does

**1. The encirclement index.** For each person:

```
ratio = urgency-weighted independent sources / (1 + allies)
```

- A *source* is one independent requester with an open request on the person. A queue fed by automation counts as one source.
- An *ally* is someone other than the requester who acted on the person's open requests in the last 14 days.
- An overdue request, or one due within 3 days, weighs 1.0; further due dates weigh less; no due date weighs 0.5.
- **calm** below 3, **wary** from 3, **cornered** from 8. Eight to one is a prudential default and a setting,
  not a published measurement.

It shows in the **issue panel** ("this request comes from X; the assignee is at 15.00 to 1; one more ally brings it to 7.50")
and on a **project page**, *The organism*, with everyone who has open work, most cornered first.
Counted to protect people, never to rank them.

**2. The membrane.** When a request is created on, or assigned to, a cornered person, Ngogo holds it in **incubation**
for 48 hours. It writes why on the request in plain words (counts only, no requester is named), proposes the calmest
colleague as an ally, and refuses nothing. A hold ends when someone releases it from the panel, when the person is no longer
cornered, when the request is reassigned, or when the time is over. An optional workflow validator can block a transition
while a request is held.

**3. The pool.** The money side of the symbiosis: a supplier cornered by clients who pay late asks a shared pool for an
advance on an invoice. The embedded **Ferret** decision engine answers yes or no with a reason (twelve ordered checks), gets
wary after a write-off and tightens its ceilings, and calms down when advances are repaid. It lives in the issue panel,
on the project page, and in the Jira Service Management customer portal, where a customer sees the answer on their own request.
*A book, not a bank: play numbers, no custody, no money moves.*

**4. An agent and an MCP server.** A Rovo agent, **Ngogo**, and the same five tools exposed to outside MCP clients:

| Tool | What it answers |
|---|---|
| `who-is-cornered` | Everyone with open work in a project, most cornered first |
| `request-encirclement` | One request: who it lands on, their ratio, its source, whether it is held and why |
| `held-requests` | What Ngogo holds in incubation now |
| `release-request` | Releases one held request (writes to Jira) |
| `advance-what-if` | Would a pool of this size advance on this invoice, and which ceiling refuses it |

[`skills/ngogo/SKILL.md`](skills/ngogo/SKILL.md) is an open skill file that teaches any third-party agent to use them.

## Try it in five minutes

You need to be an admin of a Jira site. Everything below works on a site with no data.

1. **Install** with the installation link given in the Codegeist submission. The page reads "ngogo, by matter-x-" and asks for three permissions: view Jira issue data, create and manage issues (the hold notice is a comment), and app storage (the pool's journal).
2. Open any Jira project, then the **Ngogo** tab in the project navigation (it may be under *More*).
3. Open the **Demo team** tab: a simulated team of twelve and sixty requests. Nothing is read from or written to your Jira there.
   - *One more request for Nadia*: Nadia goes from wary (7.70 to 1) to cornered (8.70 to 1); the request is held; Omar is proposed.
   - *Omar steps in*: one ally halves the ratio (4.35 to 1); the request is released.
   - Look at Ines: seven sources, more than Lea's five, and yet calm, because two people act alongside her. That is the symbiosis.
   - *Two days pass* (after *Start again* and one more request): with nobody stepping in, the hold ends, and Nadia is still cornered.
     The membrane buys time. It does not replace help.
4. Open the **This project** tab for the live index of your own project, and any request, **Apps > Ngogo**, for the panel.
5. **Pool** tab: *Fund the pool*, then in a request's panel, tab **Pool**: ask an advance without ticking
   "I checked this invoice" (refused, with the reason), then tick it (accepted).
6. **Rovo**: open Rovo chat, choose the agent **Ngogo**, ask *"Who is cornered in this project?"*.
7. **MCP**: in Atlassian Administration > Apps > Sites > your site > Connected apps > Ngogo, turn on **Tools**.
   Then connect any MCP client to `https://mcp.atlassian.com/forge/07dc8b38-0eb8-4048-8405-0832d63ac7e1` and sign in.

The live membrane needs a cornered person, so it shows on a site with real load: create a request assigned to them and
Ngogo comments within seconds. On an empty site, the Demo team runs the very same code.

## How it is built

```
src/ngogo/encirclement.js   the index: pure, integer arithmetic only
src/ngogo/membrane.js       the hold: decision, choice of the ally, the notice text (pure)
src/ngogo/pool.js           the pool: a journal of events replayed on every read, around the Ferret engine (pure)
src/ngogo/tools.js          the five agent tools
src/ngogo/views.js          the two questions: one request, one project
src/ngogo/store-jira.js     Jira as a store: a few narrow questions, each one cheap search
src/ngogo/store-memory.js   the same store in memory: the tests and the Demo team run on it
src/ngogo/demo.js           the simulated team
src/engine/                 the Ferret decision engine (see Prior work)
src/frontend/               UI Kit screens: issue panel, project page, customer portal
src/membrane.js, actions.js, resolvers/   Forge entry points
```

Four choices that matter:

- **Discovery by exclusion.** A person can have ten thousand open requests. Ngogo never reads them all: it asks Jira for
  "a request from a source I have not seen yet", notes the new sources, and asks again. A test proves the answer equals
  reading every request.
- **The viewer's own rights.** The screens read Jira through the Forge bridge with the session of the person looking,
  and the agent tools run as the person asking. Nobody is shown a request they may not browse, and there is no consent screen.
- **No personal data stored.** What Ngogo keeps is counts, dates and amounts: an issue property for a hold, a journal for the
  pool. No account id and no name is stored anywhere. Names appear only in the notice, an ordinary Jira comment, and on screen,
  read live from Jira. Tests assert it.
- **Pure cores, swappable stores.** The index, the membrane and the pool are pure functions over a store interface. Live Jira,
  the tests and the Demo team are three stores for the same code.

Forge modules: `jira:issuePanel`, `jira:projectPage`, `jiraServiceManagement:portalRequestDetailPanel`,
`jiraServiceManagement:queuePage`, `trigger`, `scheduledTrigger`, `jira:entityProperty`, `jira:workflowValidator`,
`rovo:agent`, `action` (five), `rovo:mcp`. Scopes: `read:jira-work`, `write:jira-work`, `storage:app`.

## Tests

```bash
npm install
npm test          # 49 tests, Node 24
npm run replay    # replays the 4 926 steps of Ferret's oracle against the embedded engine (needs the ferret repository)
```

The engine check also runs inside Forge: the project page shows "oracle steps replayed inside Forge, 0 mismatch".

## Prior work, disclosed

- `src/engine/` is the **Ferret** decision engine, from our own project [LeDenti/ferret](https://github.com/LeDenti/ferret),
  first written on 11 November 2026 (inside the Codegeist submission period) for another hackathon. It is copied here with
  its types erased (`tools/import-ferret.mjs`) and proven identical by replaying its reference oracle.
- The ideas of the membrane and of the mood come from our own earlier research prototypes; none of their code is included.
- Everything else in this repository was written for Codegeist between 12 and 17 November 2026.

**Who typed.** The developer set the idea, the rules, the scope and every decision. On their instruction, an AI assistant
(Claude Code) wrote the code and the tests, deployed to a development site and checked each feature in the real Jira,
Rovo and MCP before it was called done.

## Honest limits

- Eight to one is a setting. The primatology says "numerical superiority", not a ratio.
- Allies are read from one page of the person's hundred most recently touched open requests.
- The pool is a book, not a bank. Two people acting in the same second on the same pool could lose one event.
- The thresholds, the 48 hours and the 14 days are constants in the code, not yet an admin screen.
- `rovo:mcp` and `jira:workflowValidator` are Preview modules. The workflow validator and the service desk queue page are declared but were not exercised end to end.
- Membrane notices are internal comments on service desk requests, so customers are never e-mailed about a colleague's load.

## Privacy

Ngogo stores no personal data. See [PRIVACY.md](PRIVACY.md).

## Licence

MIT.
