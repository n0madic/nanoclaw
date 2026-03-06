---
name: yt-transcript
description: Download YouTube video transcripts for analysis, summarization, and research. Use whenever the user shares a YouTube link or asks about video content.
allowed-tools: Bash(yt-transcript:*)
---

# YouTube Transcript Downloader

## Quick start

```bash
yt-transcript <youtube-url-or-id>              # plain text transcript
yt-transcript <url-or-id> --timestamps         # with [MM:SS] timestamps
yt-transcript <url-or-id> --lang uk            # specific language
yt-transcript <url-or-id> --list-langs         # show available languages
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
yt-transcript https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Check which languages are available first
yt-transcript VIDEO_ID --list-langs

# Get Ukrainian transcript with timestamps
yt-transcript VIDEO_ID --lang uk --timestamps

# Pipe to file for analysis
yt-transcript VIDEO_ID > transcript.txt
```

## Notes

- Always use `--list-langs` first if unsure which languages are available
- Works without API keys; falls back to agent-browser for bot-protected videos
- Not all videos have transcripts — auto-generated captions count
- For long videos, pipe output to a file first, then read and analyze
