---
name: yt-transcript
description: Download YouTube video transcripts for analysis, summarization, and research. Use whenever the user shares a YouTube link or asks about video content.
allowed-tools: Bash(yt-transcript:*)
---

# YouTube Transcript Downloader

## Quick start

```bash
node ~/.claude/skills/yt-transcript/yt-transcript.mjs <youtube-url-or-id>
node ~/.claude/skills/yt-transcript/yt-transcript.mjs <url-or-id> --timestamps
node ~/.claude/skills/yt-transcript/yt-transcript.mjs <url-or-id> --lang uk
node ~/.claude/skills/yt-transcript/yt-transcript.mjs <url-or-id> --list-langs
```

## Accepted URL formats

```
https://www.youtube.com/watch?v=VIDEO_ID
https://youtu.be/VIDEO_ID
VIDEO_ID
```

## Examples

```bash
# Get transcript as plain text
node ~/.claude/skills/yt-transcript/yt-transcript.mjs https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Check which languages are available first
node ~/.claude/skills/yt-transcript/yt-transcript.mjs VIDEO_ID --list-langs

# Get Ukrainian transcript with timestamps
node ~/.claude/skills/yt-transcript/yt-transcript.mjs VIDEO_ID --lang uk --timestamps

# Pipe to file for analysis
node ~/.claude/skills/yt-transcript/yt-transcript.mjs VIDEO_ID > transcript.txt
```

## Notes

- Always use `--list-langs` first if unsure which languages are available
- Works without API keys; falls back to agent-browser for bot-protected videos
- Not all videos have transcripts — auto-generated captions count
- For long videos, pipe output to a file first, then read and analyze
