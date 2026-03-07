---
name: x-timeline
description: Fetch a Twitter/X user's public timeline. Use when the user asks about someone's tweets, Twitter activity, or X posts.
allowed-tools: Bash(x-timeline:*)
---

# Twitter/X Timeline Fetcher

## Quick start

```bash
node ~/.claude/skills/x-timeline/x-timeline.mjs <username>
node ~/.claude/skills/x-timeline/x-timeline.mjs <username> --count 10
```

## Accepted input formats

```
username
@username
```

## Examples

```bash
# Get latest tweets from a user
node ~/.claude/skills/x-timeline/x-timeline.mjs elonmusk

# Get only 5 most recent tweets
node ~/.claude/skills/x-timeline/x-timeline.mjs @anthropic --count 5

# Pipe to file for analysis
node ~/.claude/skills/x-timeline/x-timeline.mjs username > tweets.txt
```

## Notes

- No API keys required — uses guest token auth
- Returns up to 40 tweets per request (Twitter API limit)
- Output is structured text optimized for LLM analysis
- Rate limits apply — wait a minute if you get rate-limited
- Only fetches public timelines (private/protected accounts will fail)
