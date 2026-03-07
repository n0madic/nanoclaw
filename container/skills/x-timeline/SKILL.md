---
name: x-timeline
description: Fetch a Twitter/X user's public timeline. Use when the user asks about someone's tweets, Twitter activity, or X posts.
allowed-tools: Bash(x-syndication:*)
---

# Twitter/X Timeline Fetcher

## Quick start

```bash
npx tsx ~/.claude/skills/x-timeline/x-syndication.ts <username>
```

## Accepted input formats

```
username
@username
```

## Examples

```bash
# Get latest tweets from a user
npx tsx ~/.claude/skills/x-timeline/x-syndication.ts elonmusk

# Pipe to file for analysis
npx tsx ~/.claude/skills/x-timeline/x-syndication.ts username > tweets.txt
```

## Notes

- No API keys required — uses Twitter syndication endpoint
- Output is structured text optimized for LLM analysis
- Rate limits apply — wait a minute if you get rate-limited
- Only fetches public timelines (private/protected accounts will fail)
