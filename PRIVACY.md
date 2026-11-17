# Privacy policy of Ngogo for Jira

*Last updated: 17 November 2026.*

Ngogo for Jira is a Forge app. It runs entirely on Atlassian's infrastructure (it is eligible for *Runs on Atlassian*):
it has no server of its own, sends nothing outside Atlassian, and contains no analytics or tracking of ours.

## What Ngogo reads

To compute the balance of power around a person, Ngogo reads from your Jira site, at the moment a screen or a tool asks for it:
who a request is assigned to, who reported it, its due date, its project, and who commented on it and when.
It never asks Jira for the title or the description of a request. Jira returns comments together with their text; Ngogo keeps
only who commented and when, and discards the text at once.

- On the screens, these reads are made with the Jira session of the person looking at the page.
- In the Rovo agent and through the MCP server, they are made with the rights of the person asking.
- When a request is created or assigned, and once an hour, Ngogo reads the same fields as the app, to decide whether to hold
  the request or to release it.

Nobody is shown, through Ngogo, a request they are not allowed to browse in Jira.

## What Ngogo stores

Ngogo stores no personal data: no account id, no name, no e-mail address.

It stores two things, both inside Atlassian:

- **On a request it holds**, an issue property with counts and dates only: when the hold started and ends, the ratio,
  the number of sources and of allies at that moment, and whether an ally was proposed.
- **For the pool**, in Forge storage, a journal per project: amounts, day numbers, request keys, and the debtor name typed by
  the person who asked for an advance. Do not type a private individual's name as a debtor.

## What Ngogo writes

When it holds or releases a request, Ngogo adds a comment to that request. The comment names the assignee and, when there is one,
the proposed ally. It is an ordinary Jira comment, stored by Jira with the request, and it is marked internal on service desk requests
so that it is never sent to customers.

## Deleting

Uninstalling the app removes its Forge storage. The comments and the issue properties it wrote stay on the requests, like any other
Jira content, until a site admin removes them.

## The demo team

The *Demo team* tab runs on invented names and invented requests held in the browser's memory. Nothing in it is read from or
written to your site.

## Contact

Questions and requests: <https://github.com/LeDenti/ngogo/issues>.
