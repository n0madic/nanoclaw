#!/usr/bin/env node

const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help')) {
  console.log(`Usage: x-timeline <username> [options]

Options:
  --count N    Number of tweets to show (default: 20, max: 40)
  --help       Show this help message

Examples:
  x-timeline elonmusk
  x-timeline @anthropic --count 5`);
  process.exit(args.includes('--help') ? 0 : 1);
}

const username = args[0].replace(/^@/, '');
const countIdx = args.indexOf('--count');
const count = countIdx !== -1 ? Math.min(parseInt(args[countIdx + 1]) || 20, 40) : 20;

// Constants from twitter-timeline Go package
const BEARER_TOKEN = 'AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';
const BASE_URL = 'https://api.x.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';
const USER_BY_SCREEN_NAME_PATH = '/graphql/1VOOyvKkiI3FMmkeDNxM9A/UserByScreenName';
const USER_TWEETS_PATH = '/graphql/HeWHY26ItCfUmm1e6ITjeA/UserTweets';

function makeHeaders(guestToken) {
  return {
    'Accept': '*/*',
    'Accept-Language': 'en',
    'Authorization': `Bearer ${BEARER_TOKEN}`,
    'Content-Type': 'application/json',
    'Origin': 'https://x.com',
    'Referer': 'https://x.com/',
    'User-Agent': USER_AGENT,
    'X-Guest-Token': guestToken,
    'X-Twitter-Active-User': 'yes',
    'X-Twitter-Client-Language': 'en',
  };
}

async function getGuestToken() {
  const resp = await fetch(`${BASE_URL}/1.1/guest/activate.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BEARER_TOKEN}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Failed to get guest token: ${resp.status} ${body}`);
  }
  const data = await resp.json();
  return data.guest_token;
}

async function graphqlRequest(path, variables, features, fieldToggles, guestToken) {
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    features: JSON.stringify(features),
  });
  if (fieldToggles) params.set('fieldToggles', JSON.stringify(fieldToggles));

  const url = `${BASE_URL}${path}?${params}`;
  const resp = await fetch(url, { headers: makeHeaders(guestToken) });

  if (resp.status === 429) {
    throw new Error('Rate limit exceeded. Please wait a minute and try again.');
  }
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`API error ${resp.status}: ${body}`);
  }
  return resp.json();
}

async function getUserId(screenName, guestToken) {
  const data = await graphqlRequest(
    USER_BY_SCREEN_NAME_PATH,
    { screen_name: screenName, withSafetyModeUserFields: true },
    {
      highlights_tweets_tab_ui_enabled: true,
      hidden_profile_likes_enabled: true,
      hidden_profile_subscriptions_enabled: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      subscriptions_verification_info_verified_since_enabled: true,
      subscriptions_verification_info_is_identity_verified_enabled: false,
      responsive_web_twitter_article_notes_tab_enabled: false,
      subscriptions_feature_can_gift_premium: false,
      profile_label_improvements_pcf_label_in_post_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
    },
    { withAuxiliaryUserLabels: true },
    guestToken,
  );

  const userId = data?.data?.user?.result?.rest_id;
  if (!userId) {
    if (data?.errors?.length) throw new Error(`User lookup failed: ${data.errors[0].message}`);
    throw new Error(`User not found: @${screenName}`);
  }
  return userId;
}

async function getUserTweets(userId, guestToken) {
  return graphqlRequest(
    USER_TWEETS_PATH,
    {
      userId,
      count: 40,
      includePromotedContent: true,
      withQuickPromoteEligibilityTweetFields: true,
      withVoice: true,
      withV2Timeline: true,
    },
    {
      rweb_video_screen_enabled: false,
      profile_label_improvements_pcf_label_in_post_enabled: false,
      rweb_tipjar_consumption_enabled: true,
      creator_subscriptions_tweet_preview_api_enabled: true,
      responsive_web_graphql_timeline_navigation_enabled: true,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      premium_content_api_read_enabled: false,
      communities_web_enable_tweet_community_results_fetch: true,
      c9s_tweet_anatomy_moderator_badge_enabled: true,
      responsive_web_grok_analyze_button_fetch_trends_enabled: false,
      responsive_web_grok_analyze_post_followups_enabled: false,
      responsive_web_jetfuel_frame: false,
      responsive_web_grok_share_attachment_enabled: true,
      articles_preview_enabled: true,
      responsive_web_edit_tweet_api_enabled: true,
      graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
      view_counts_everywhere_api_enabled: true,
      longform_notetweets_consumption_enabled: true,
      responsive_web_twitter_article_tweet_consumption_enabled: true,
      tweet_awards_web_tipping_enabled: false,
      responsive_web_grok_show_grok_translated_post: false,
      responsive_web_grok_analysis_button_from_backend: false,
      creator_subscriptions_quote_tweet_preview_enabled: false,
      freedom_of_speech_not_reach_fetch_enabled: true,
      standardized_nudges_misinfo: true,
      tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
      longform_notetweets_rich_text_read_enabled: true,
      longform_notetweets_inline_media_enabled: true,
      responsive_web_grok_image_annotation_enabled: true,
      responsive_web_enhance_cards_enabled: false,
      rweb_video_timestamps_enabled: true,
    },
    { withArticlePlainText: false },
    guestToken,
  );
}

function processTweet(result, isPinned = false) {
  if (!result?.legacy?.full_text) return null;

  const legacy = result.legacy;
  const screenName = result.core?.user_results?.result?.legacy?.screen_name || '';

  let isRetweet = !!(legacy.retweeted_status_id_str || result.retweeted_status_result?.result || legacy.full_text.startsWith('RT @'));
  const isReply = !!legacy.in_reply_to_status_id_str;
  const isQuoted = !!(legacy.is_quote_status || legacy.quoted_status_id_str);

  // Unwrap retweet to get original content
  let tweetData = result;
  if (isRetweet && result.retweeted_status_result?.result) {
    tweetData = result.retweeted_status_result.result;
    if (!tweetData.legacy?.full_text) return null;
  }

  const td = tweetData.legacy;
  const tweetScreenName = tweetData.core?.user_results?.result?.legacy?.screen_name || screenName;

  // Extract images
  const images = [];
  const mediaSource = td.extended_entities?.media || td.entities?.media || [];
  for (const m of mediaSource) {
    if (m.type === 'photo' && m.media_url_https) images.push(m.media_url_https);
  }

  // Extract hashtags
  const hashtags = (td.entities?.hashtags || []).map(h => h.text);

  // Extract URLs
  const urls = (td.entities?.urls || []).map(u => ({
    short: u.url,
    expanded: u.expanded_url,
    display: u.display_url,
  }));

  // Extract mentions
  const mentions = [];
  const mentionRe = /@(\w+)/g;
  let match;
  while ((match = mentionRe.exec(td.full_text)) !== null) mentions.push(match[1]);

  // Expand t.co links in text and strip trailing media URLs
  let text = td.full_text;
  for (const u of (td.entities?.urls || [])) {
    text = text.replaceAll(u.url, u.expanded_url || u.url);
  }
  for (const m of (td.entities?.media || [])) {
    text = text.replaceAll(m.url, '').trim();
  }

  // Format date
  let date = td.created_at || '';
  try {
    date = new Date(date).toISOString().split('T')[0];
  } catch { /* keep original */ }

  return {
    id: tweetData.rest_id,
    text,
    date,
    username: tweetScreenName,
    userId: td.user_id_str,
    likes: td.favorite_count || 0,
    retweets: td.retweet_count || 0,
    replies: td.reply_count || 0,
    isPinned: isPinned,
    isRetweet,
    isReply,
    isQuoted,
    images,
    hashtags,
    urls,
    mentions,
    link: tweetScreenName && tweetData.rest_id
      ? `https://x.com/${tweetScreenName}/status/${tweetData.rest_id}`
      : '',
  };
}

function extractTweets(response) {
  const tweets = [];
  const instructions = response?.data?.user?.result?.timeline?.timeline?.instructions || [];

  for (const instruction of instructions) {
    if (instruction.type === 'TimelineAddEntries') {
      for (const entry of (instruction.entries || [])) {
        if (entry.entryId?.includes('tweet-') && entry.content?.itemContent) {
          const t = processTweet(entry.content.itemContent.tweet_results?.result);
          if (t) tweets.push(t);
        }
        if (entry.entryId?.includes('profile-conversation-') &&
            entry.content?.entryType === 'TimelineTimelineModule' &&
            entry.content?.items) {
          for (const item of entry.content.items) {
            if (item.entryId?.includes('tweet-')) {
              const t = processTweet(item.item?.itemContent?.tweet_results?.result);
              if (t) tweets.push(t);
            }
          }
        }
      }
    } else if (instruction.type === 'TimelinePinEntry' && instruction.entry) {
      if (instruction.entry.entryId?.includes('tweet-') && instruction.entry.content?.itemContent) {
        const t = processTweet(instruction.entry.content.itemContent.tweet_results?.result, true);
        if (t) tweets.push(t);
      }
    }
  }

  return tweets;
}

function formatTweet(tweet) {
  const flags = [];
  if (tweet.isPinned) flags.push('pinned');
  if (tweet.isRetweet) flags.push('retweet');
  if (tweet.isReply) flags.push('reply');
  if (tweet.isQuoted) flags.push('quote');

  const flagStr = flags.length ? ' [' + flags.join('] [') + ']' : '';
  const lines = [`@${tweet.username} — ${tweet.date}${flagStr}`, '---', tweet.text, ''];

  lines.push(`Stats: ${tweet.likes} likes · ${tweet.retweets} retweets · ${tweet.replies} replies`);

  if (tweet.hashtags.length) lines.push(`Hashtags: ${tweet.hashtags.map(h => '#' + h).join(' ')}`);
  if (tweet.images.length) lines.push(`Images: ${tweet.images.join(', ')}`);
  if (tweet.link) lines.push(`Link: ${tweet.link}`);

  lines.push('---');
  return lines.join('\n');
}

// Main
try {
  const guestToken = await getGuestToken();
  const userId = await getUserId(username, guestToken);
  const response = await getUserTweets(userId, guestToken);
  const tweets = extractTweets(response).slice(0, count);

  if (tweets.length === 0) {
    console.error(`No tweets found for @${username}`);
    process.exit(1);
  }

  console.log(`Timeline for @${username} (${tweets.length} tweets)\n`);
  for (const tweet of tweets) {
    console.log(formatTweet(tweet));
    console.log('');
  }
} catch (err) {
  console.error(`Error: ${err.message}`);
  process.exit(1);
}
