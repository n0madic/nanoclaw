#!/usr/bin/env npx tsx

import { execSync } from "child_process";

interface Tweet {
  id_str: string;
  full_text: string;
  created_at: string;
  favorite_count: number;
  retweet_count: number;
  reply_count: number;
  quote_count: number;
  lang: string;
  permalink: string;
  quoted_status?: {
    full_text: string;
    user: { screen_name: string; name: string };
  };
  user: {
    screen_name: string;
    name: string;
    description: string;
    followers_count: number;
    statuses_count: number;
  };
}

interface TimelineEntry {
  type: string;
  content: { tweet: Tweet };
}

function fetchWithCurl(screenName: string): string {
  const params = new URLSearchParams({
    dnt: "false",
    embedId: "twitter-widget-0",
    features: "e30=",
    frame: "false",
    hideBorder: "false",
    hideFooter: "false",
    hideHeader: "false",
    hideScrollBar: "false",
    lang: "en",
    origin: "https://x.com",
    showHeader: "true",
    showReplies: "false",
    transparent: "false",
    widgetsVersion: "2615f7e52b7e0:1702314776716",
  });

  const targetUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(screenName)}?${params}`;

  const headers = [
    ["accept", "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7"],
    ["accept-language", "uk"],
    ["priority", "u=0, i"],
    ["sec-ch-ua", '"Not:A-Brand";v="99", "Google Chrome";v="145", "Chromium";v="145"'],
    ["sec-ch-ua-mobile", "?0"],
    ["sec-ch-ua-platform", '"macOS"'],
    ["sec-fetch-dest", "iframe"],
    ["sec-fetch-mode", "navigate"],
    ["sec-fetch-site", "cross-site"],
    ["sec-fetch-storage-access", "none"],
    ["upgrade-insecure-requests", "1"],
    ["user-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36"],
  ];

  const headerArgs = headers
    .map(([k, v]) => `-H ${JSON.stringify(`${k}: ${v}`)}`)
    .join(" ");

  const cmd = `curl -s ${headerArgs} ${JSON.stringify(targetUrl)}`;

  return execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
}

function extractJsonFromHtml(html: string): object | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function formatTweet(tweet: Tweet, index: number): string {
  const lines: string[] = [];

  lines.push(`--- Tweet #${index + 1} ---`);
  lines.push(`ID:   ${tweet.id_str}`);
  lines.push(`Date: ${formatDate(tweet.created_at)}`);
  lines.push(`URL:  https://x.com${tweet.permalink}`);
  lines.push(`Text: ${tweet.full_text}`);

  if (tweet.quoted_status) {
    lines.push(`Quoted (@${tweet.quoted_status.user.screen_name}): ${tweet.quoted_status.full_text}`);
  }

  lines.push(
    `Stats: ❤️ ${tweet.favorite_count}  🔁 ${tweet.retweet_count}  💬 ${tweet.reply_count}  🔗 ${tweet.quote_count}`
  );
  lines.push(`Lang: ${tweet.lang}`);

  return lines.join("\n");
}

function main() {
  const screenName = process.argv[2];

  if (!screenName) {
    console.error("Usage: tsx twitter-timeline.ts <screen-name>");
    console.error("Example: tsx twitter-timeline.ts karpathy");
    process.exit(1);
  }

  process.stderr.write(`Fetching timeline for @${screenName}...\n`);

  let html: string;
  try {
    html = fetchWithCurl(screenName);
  } catch (err) {
    console.error("curl failed:", err);
    process.exit(1);
  }

  const trimmed = html.trim();
  if (!trimmed || trimmed === "Rate limit exceeded") {
    console.error(`Error from server: ${trimmed}`);
    process.exit(1);
  }

  const json = extractJsonFromHtml(html) as any;
  if (!json) {
    process.stderr.write("Raw response start:\n" + html.slice(0, 500) + "\n");
    console.error("Failed to extract JSON from response.");
    process.exit(1);
  }

  const timeline = json?.props?.pageProps?.timeline;
  if (!timeline) {
    console.error("No timeline data in response.");
    process.exit(1);
  }

  const entries: TimelineEntry[] = timeline.entries ?? [];
  const tweets = entries
    .filter((e) => e.type === "tweet" && e.content?.tweet)
    .map((e) => e.content.tweet);

  if (tweets.length === 0) {
    console.log("No tweets found.");
    process.exit(0);
  }

  const user = tweets[0].user;

  console.log("=== TWITTER TIMELINE ===");
  console.log(`Account:   @${user.screen_name} (${user.name})`);
  console.log(`Bio:       ${user.description}`);
  console.log(`Followers: ${user.followers_count.toLocaleString()}`);
  console.log(`Tweets:    ${user.statuses_count.toLocaleString()} total, ${tweets.length} fetched`);
  console.log("========================\n");

  tweets.forEach((tweet, i) => {
    console.log(formatTweet(tweet, i));
    console.log();
  });
}

main();
