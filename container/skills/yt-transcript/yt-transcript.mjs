#!/usr/bin/env node

import { createRequire } from 'module';
const require = createRequire('/usr/local/lib/node_modules/');
const { YoutubeTranscript } = require('youtube-transcript-plus');

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: yt-transcript <youtube-url-or-id> [options]

Options:
  --timestamps   Include [MM:SS] timestamps
  --lang <code>  Preferred transcript language (e.g. en, uk, ru, es)
  --list-langs   List available transcript languages for the video
  --help         Show this help message

Examples:
  yt-transcript https://www.youtube.com/watch?v=VIDEO_ID
  yt-transcript VIDEO_ID --timestamps
  yt-transcript VIDEO_ID --lang uk
  yt-transcript VIDEO_ID --list-langs`);
  process.exit(args.includes('--help') ? 0 : 1);
}

const input = args[0];
const showTimestamps = args.includes('--timestamps');
const listLangs = args.includes('--list-langs');
const langIdx = args.indexOf('--lang');
const lang = langIdx !== -1 ? args[langIdx + 1] : undefined;

function extractVideoId(input) {
  try {
    const url = new URL(input);
    if (url.hostname === 'youtu.be') return url.pathname.slice(1);
    if (url.searchParams.has('v')) return url.searchParams.get('v');
  } catch {
    // Not a URL
  }
  return input;
}

function decodeHtmlEntities(text) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

function formatTime(seconds) {
  const min = String(Math.floor(seconds / 60)).padStart(2, '0');
  const sec = String(Math.floor(seconds) % 60).padStart(2, '0');
  return `${min}:${sec}`;
}

// Fetch caption tracks metadata via page scrape
async function fetchCaptionTracks(videoId) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const html = await resp.text();
  const match = html.match(/ytInitialPlayerResponse\s*=\s*(\{.+?\});/s);
  if (!match) return { tracks: null, blocked: false };
  const pr = JSON.parse(match[1]);
  if (pr?.playabilityStatus?.status === 'LOGIN_REQUIRED') {
    return { tracks: null, blocked: true };
  }
  return { tracks: pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || null, blocked: false };
}

const videoId = extractVideoId(input);

// --list-langs: show available languages and exit
if (listLangs) {
  const { tracks, blocked } = await fetchCaptionTracks(videoId);
  if (blocked) {
    console.error('YouTube requires sign-in from this IP (bot detection on datacenter IPs).');
    console.error('Transcript may still work for this video — try: yt-transcript ' + videoId);
    process.exit(1);
  }
  if (tracks && tracks.length > 0) {
    for (const t of tracks) {
      const auto = t.kind === 'asr' ? ' (auto-generated)' : '';
      console.log(`  ${t.languageCode.padEnd(8)} ${t.name?.simpleText || t.languageCode}${auto}`);
    }
  } else {
    console.error('No transcript tracks found for this video.');
  }
  process.exit(0);
}

// Resolve language: explicit --lang, or detect default from caption tracks
let resolvedLang = lang;
if (!resolvedLang) {
  const { tracks } = await fetchCaptionTracks(videoId).catch(() => ({ tracks: null }));
  if (tracks && tracks.length > 0) {
    // Prefer manual captions over auto-generated
    const manual = tracks.find(t => t.kind !== 'asr');
    resolvedLang = (manual || tracks[0]).languageCode;
  }
}

// Main: fetch transcript
try {
  const config = {};
  if (resolvedLang) config.lang = resolvedLang;

  const transcript = await YoutubeTranscript.fetchTranscript(input, config);

  if (!transcript || transcript.length === 0) {
    console.error('Transcript is empty.');
    process.exit(1);
  }

  for (const entry of transcript) {
    const text = decodeHtmlEntities(entry.text.replace(/\n/g, ' ').trim());
    if (showTimestamps) {
      console.log(`[${formatTime(entry.offset)}] ${text}`);
    } else {
      console.log(text);
    }
  }
} catch (err) {
  const msg = err.message || '';

  // Check if it's a bot detection issue
  const { blocked } = await fetchCaptionTracks(videoId).catch(() => ({ blocked: false }));
  if (blocked) {
    console.error('YouTube requires sign-in from this IP (bot detection on datacenter IPs).');
    console.error('This video cannot be accessed from the current server.');
    process.exit(1);
  }

  // Check available languages if transcript not found
  const { tracks } = await fetchCaptionTracks(videoId).catch(() => ({ tracks: null }));
  if (tracks && tracks.length > 0) {
    console.error(`Transcript not found${lang ? ` for language "${lang}"` : ''}. Available languages:`);
    for (const t of tracks) {
      const auto = t.kind === 'asr' ? ' (auto-generated)' : '';
      console.error(`  ${t.languageCode.padEnd(8)} ${t.name?.simpleText || t.languageCode}${auto}`);
    }
    console.error(`\nTry: yt-transcript ${videoId} --lang <code>`);
  } else {
    console.error(`Error: ${msg}`);
  }
  process.exit(1);
}
