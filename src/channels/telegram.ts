import fs from 'fs';
import path from 'path';

import { Bot } from 'grammy';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { resolveGroupFolderPath } from '../group-folder.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import {
  Channel,
  OnChatMetadata,
  OnInboundMessage,
  RegisteredGroup,
} from '../types.js';

/**
 * Wrap bare file references (e.g. bridge.ts, config.md) in <code> tags to
 * prevent Telegram from auto-linking extensions like .ts or .md as domains.
 * Skips content already inside <pre> or <code> blocks.
 */
function wrapFileRefs(html: string): string {
  const fileRe =
    /\b([\w][\w.-]*\.(ts|tsx|js|jsx|py|go|md|json|yaml|yml|sh|css|html|txt|log|env|toml|lock))\b/g;
  let insideCode = 0;
  return html
    .split(/(<\/?(?:pre|code)[^>]*>)/)
    .map((seg, i) => {
      if (i % 2 === 1) {
        if (/^<(?:pre|code)/.test(seg)) insideCode++;
        else insideCode = Math.max(0, insideCode - 1);
        return seg;
      }
      return insideCode === 0 ? seg.replace(fileRe, '<code>$1</code>') : seg;
    })
    .join('');
}

/**
 * Regex matching HTML tags that Telegram's Bot API accepts natively.
 * Opening tags (with optional attributes) and closing tags are both matched.
 */
const TG_TAG_RE =
  /<\/?(?:b|strong|i|em|u|ins|s|strike|del|code|pre|blockquote|tg-spoiler|tg-emoji)(?:\s[^>]*)?>|<a\s+href="[^"]*"[^>]*>|<\/a>/gi;

/**
 * HTML tags that are NOT valid in Telegram but have reasonable text
 * equivalents — convert before escaping so they don't appear as raw tags.
 */
function stripNonTgHtml(text: string): string {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '\n')
    .replace(
      /<\/?(?:div|span|h[1-6]|ul|ol|li|section|article|header|footer|nav|main|figure|figcaption|table|tr|td|th|thead|tbody|img|hr)[^>]*>/gi,
      '',
    );
}

/**
 * Strip markdown inline formatting (bold, italic, code, links) to get plain text.
 */
function stripMdInline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*([^*]+?)\*/g, '$1')
    .replace(/(?<![_\w])_([^_]+?)_(?![_\w])/g, '$1')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

/**
 * Detect markdown table blocks and convert them to fenced code blocks
 * with box-drawing characters and aligned columns.
 */
function convertMarkdownTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    // A table needs at least: header row, separator row
    if (
      /^\|(.+\|)+\s*$/.test(lines[i]) &&
      i + 1 < lines.length &&
      /^\|[\s:]*-+[\s:]*(\|[\s:]*-+[\s:]*)+\|?\s*$/.test(lines[i + 1])
    ) {
      const tableLines: string[] = [];
      tableLines.push(lines[i]);
      tableLines.push(lines[i + 1]);
      let j = i + 2;
      while (j < lines.length && /^\|(.+\|)+\s*$/.test(lines[j])) {
        tableLines.push(lines[j]);
        j++;
      }

      // Parse cells (skip separator row), strip markdown formatting
      const rows = tableLines
        .filter((_, idx) => idx !== 1)
        .map((line) =>
          line
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((c) => stripMdInline(c.trim())),
        );

      // Calculate column widths
      const colCount = Math.max(...rows.map((r) => r.length));
      const widths: number[] = [];
      for (let c = 0; c < colCount; c++) {
        widths.push(Math.max(...rows.map((r) => (r[c] || '').length), 1));
      }

      // Render as aligned text table with box-drawing chars
      const pad = (s: string, w: number) =>
        s + ' '.repeat(Math.max(0, w - s.length));
      const renderRow = (cells: string[]) =>
        '│ ' +
        widths.map((w, c) => pad(cells[c] || '', w)).join(' │ ') +
        ' │';
      const hLine = (l: string, m: string, r: string, fill: string) =>
        l + widths.map((w) => fill.repeat(w + 2)).join(m) + r;

      const preLines: string[] = [];
      preLines.push(hLine('┌', '┬', '┐', '─'));
      preLines.push(renderRow(rows[0])); // header
      preLines.push(hLine('├', '┼', '┤', '─'));
      for (let r = 1; r < rows.length; r++) {
        preLines.push(renderRow(rows[r]));
      }
      preLines.push(hLine('└', '┴', '┘', '─'));

      // Wrap as fenced code block so existing code-block logic protects it
      result.push('```\n' + preLines.join('\n') + '\n```');
      i = j;
    } else {
      result.push(lines[i]);
      i++;
    }
  }

  return result.join('\n');
}

export function markdownToTelegramHtml(md: string): string {
  // Strip non-Telegram HTML tags first (br→newline, etc.)
  md = stripNonTgHtml(md);

  // Convert markdown tables to <pre> blocks before further processing
  md = convertMarkdownTables(md);

  // Preserve Telegram-valid HTML tags from escaping
  const tgTags: string[] = [];
  md = md.replace(TG_TAG_RE, (tag) => {
    tgTags.push(tag);
    return `\x00TG${tgTags.length - 1}\x00`;
  });

  const escapeHtml = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Preserve code blocks
  const codeBlocks: string[] = [];
  let out = md.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const escaped = escapeHtml(code.trimEnd());
    const block = lang
      ? `<pre><code class="language-${lang}">${escaped}</code></pre>`
      : `<pre>${escaped}</pre>`;
    codeBlocks.push(block);
    return `\x00CODE${codeBlocks.length - 1}\x00`;
  });

  const inlineCodes: string[] = [];
  out = out.replace(/`([^`\n]+)`/g, (_, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\x00INLINE${inlineCodes.length - 1}\x00`;
  });

  // Escape HTML outside code
  out = out
    .split(/(\x00(?:CODE|INLINE)\d+\x00)/)
    .map((p) => (/^\x00(?:CODE|INLINE)\d+\x00$/.test(p) ? p : escapeHtml(p)))
    .join('');

  // Block elements
  out = out
    .split('\n')
    .map((line) => {
      const h = line.match(/^(#{1,6})\s+(.+)$/);
      if (h) return `<b>${h[2]}</b>`;
      if (/^[-*_]{3,}$/.test(line.trim())) return '─────────────';
      if (line.startsWith('&gt; '))
        return `<blockquote>${line.slice(5)}</blockquote>`;
      return line.replace(/^(\s*)[-*+]\s+/, '$1• ');
    })
    .join('\n');

  // Inline formatting
  out = out.replace(/\*\*(.+?)\*\*/gs, '<b>$1</b>');
  out = out.replace(/__(.+?)__/gs, '<b>$1</b>');
  out = out.replace(/\*([^*\n]+?)\*/g, '<i>$1</i>');
  out = out.replace(/(?<![_\w])_([^_\n]+?)_(?![_\w])/g, '<i>$1</i>');
  out = out.replace(/~~(.+?)~~/gs, '<s>$1</s>');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Restore code
  out = out.replace(/\x00CODE(\d+)\x00/g, (_, i) => codeBlocks[+i]);
  out = out.replace(/\x00INLINE(\d+)\x00/g, (_, i) => inlineCodes[+i]);

  // Restore preserved Telegram HTML tags
  out = out.replace(/\x00TG(\d+)\x00/g, (_, i) => tgTags[+i]);

  return wrapFileRefs(out.trim());
}

export interface TelegramChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  onClearSession?: (chatJid: string) => void;
}

const CHUNK_LIMIT = 3800;

export function splitMarkdown(text: string): string[] {
  if (text.length <= CHUNK_LIMIT) return [text];
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > CHUNK_LIMIT) {
    let splitAt = -1;
    let inCodeBlock = false;
    let lastSafeParagraph = -1;
    let lastSafeLine = -1;

    for (let i = 0; i < Math.min(remaining.length, CHUNK_LIMIT); i++) {
      if (remaining[i] === '`' && remaining.slice(i, i + 3) === '```') {
        const atLineStart = i === 0 || remaining[i - 1] === '\n';
        if (atLineStart) {
          inCodeBlock = !inCodeBlock;
          i += 2;
          continue;
        }
      }
      if (!inCodeBlock) {
        if (remaining[i] === '\n' && remaining[i + 1] === '\n') {
          lastSafeParagraph = i;
        } else if (remaining[i] === '\n') {
          lastSafeLine = i;
        }
      }
    }

    if (lastSafeParagraph > 500) splitAt = lastSafeParagraph;
    else if (lastSafeLine > 0) splitAt = lastSafeLine;
    else splitAt = CHUNK_LIMIT;

    chunks.push(remaining.slice(0, splitAt));
    const next = remaining.slice(splitAt);
    remaining = next.startsWith('\n\n')
      ? next.slice(2)
      : next.startsWith('\n')
        ? next.slice(1)
        : next;
  }

  if (remaining) chunks.push(remaining);
  return chunks;
}

export class TelegramChannel implements Channel {
  name = 'telegram';

  private bot: Bot | null = null;
  private opts: TelegramChannelOpts;
  private botToken: string;

  constructor(botToken: string, opts: TelegramChannelOpts) {
    this.botToken = botToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken);

    // Command to get chat ID (useful for registration)
    this.bot.command('chatid', (ctx) => {
      const chatId = ctx.chat.id;
      const chatType = ctx.chat.type;
      const chatName =
        chatType === 'private'
          ? ctx.from?.first_name || 'Private'
          : (ctx.chat as any).title || 'Unknown';

      ctx.reply(
        `Chat ID: \`tg:${chatId}\`\nName: ${chatName}\nType: ${chatType}`,
        { parse_mode: 'Markdown' },
      );
    });

    // Command to check bot status
    this.bot.command('ping', (ctx) => {
      ctx.reply(`${ASSISTANT_NAME} is online.`);
    });

    // List available commands
    this.bot.command('help', (ctx) => {
      const lines = [
        `<b>${ASSISTANT_NAME} Commands</b>`,
        '',
        '/help — Show this command list',
        '/ping — Check if the bot is online',
        "/chatid — Show this chat's registration ID",
        '/clear — Reset the conversation (agent forgets history)',
        '',
        `<b>Trigger:</b> mention <code>@${ASSISTANT_NAME}</code> to talk to the bot`,
      ];
      ctx.reply(lines.join('\n'), { parse_mode: 'HTML' });
    });

    // Clear conversation session
    this.bot.command('clear', (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        ctx.reply(
          'This chat is not registered. Use /chatid to get the registration ID.',
        );
        return;
      }
      if (this.opts.onClearSession) {
        this.opts.onClearSession(chatJid);
      }
      ctx.reply('Conversation cleared. The agent will start fresh.');
    });

    this.bot.on('message:text', async (ctx) => {
      // Skip commands
      if (ctx.message.text.startsWith('/')) return;

      const chatJid = `tg:${ctx.chat.id}`;
      let content = ctx.message.text;

      // Handle reply context — include the message being replied to
      if (ctx.message.reply_to_message) {
        const replied = ctx.message.reply_to_message;
        const replyAuthor =
          replied.from?.first_name ||
          replied.from?.username ||
          replied.from?.id?.toString() ||
          'Unknown';
        const replyText = replied.text || replied.caption || '[media]';
        const truncated =
          replyText.length > 200 ? replyText.slice(0, 200) + '…' : replyText;
        content = `[Reply to ${replyAuthor}: "${truncated}"]\n${content}`;
      }

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id.toString() ||
        'Unknown';
      const sender = ctx.from?.id.toString() || '';
      const msgId = ctx.message.message_id.toString();

      // Determine chat name
      const chatName =
        ctx.chat.type === 'private'
          ? senderName
          : (ctx.chat as any).title || chatJid;

      // Translate Telegram @bot_username mentions into TRIGGER_PATTERN format.
      // Telegram @mentions (e.g., @andy_ai_bot) won't match TRIGGER_PATTERN
      // (e.g., ^@Andy\b), so we prepend the trigger when the bot is @mentioned.
      const botUsername = ctx.me?.username?.toLowerCase();
      if (botUsername) {
        const entities = ctx.message.entities || [];
        const isBotMentioned = entities.some((entity) => {
          if (entity.type === 'mention') {
            const mentionText = content
              .substring(entity.offset, entity.offset + entity.length)
              .toLowerCase();
            return mentionText === `@${botUsername}`;
          }
          return false;
        });
        if (isBotMentioned && !TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Store chat metadata for discovery
      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        chatName,
        'telegram',
        isGroup,
      );

      // Only deliver full message for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug(
          { chatJid, chatName },
          'Message from unregistered Telegram chat',
        );
        return;
      }

      // Deliver message — startMessageLoop() will pick it up
      this.opts.onMessage(chatJid, {
        id: msgId,
        chat_jid: chatJid,
        sender,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });

      logger.info(
        { chatJid, chatName, sender: senderName },
        'Telegram message stored',
      );
    });

    // Download media file via Telegram Bot API and save to group's media folder
    const downloadMedia = async (
      fileId: string,
      groupFolder: string,
      filename: string,
    ): Promise<string | null> => {
      try {
        const file = await this.bot!.api.getFile(fileId);
        const url = `https://api.telegram.org/file/bot${this.botToken}/${file.file_path}`;
        const resp = await fetch(url);
        const buffer = Buffer.from(await resp.arrayBuffer());
        const mediaDir = path.join(
          resolveGroupFolderPath(groupFolder),
          'media',
        );
        fs.mkdirSync(mediaDir, { recursive: true });
        fs.writeFileSync(path.join(mediaDir, filename), buffer);
        return `media/${filename}`;
      } catch (err) {
        logger.warn({ err }, 'Failed to download Telegram media');
        return null;
      }
    };

    // Handle non-text messages with placeholders so the agent knows something was sent
    const storeNonText = (ctx: any, placeholder: string) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;

      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const senderName =
        ctx.from?.first_name ||
        ctx.from?.username ||
        ctx.from?.id?.toString() ||
        'Unknown';
      const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';
      let content = `${placeholder}${caption}`;

      // Handle reply context
      if (ctx.message.reply_to_message) {
        const replied = ctx.message.reply_to_message;
        const replyAuthor =
          replied.from?.first_name ||
          replied.from?.username ||
          replied.from?.id?.toString() ||
          'Unknown';
        const replyText = replied.text || replied.caption || '[media]';
        const truncated =
          replyText.length > 200 ? replyText.slice(0, 200) + '…' : replyText;
        content = `[Reply to ${replyAuthor}: "${truncated}"]\n${content}`;
      }

      const isGroup =
        ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
      this.opts.onChatMetadata(
        chatJid,
        timestamp,
        undefined,
        'telegram',
        isGroup,
      );
      this.opts.onMessage(chatJid, {
        id: ctx.message.message_id.toString(),
        chat_jid: chatJid,
        sender: ctx.from?.id?.toString() || '',
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
      });
    };

    this.bot.on('message:photo', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      const msgId = ctx.message.message_id;
      const photo = ctx.message.photo;
      const fileId = photo[photo.length - 1].file_id;
      const mediaPath = await downloadMedia(
        fileId,
        group.folder,
        `photo_${msgId}.jpg`,
      );
      const placeholder = mediaPath ? `[Photo: ${mediaPath}]` : '[Photo]';
      storeNonText(ctx, placeholder);
    });

    this.bot.on('message:video', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      const msgId = ctx.message.message_id;
      const mediaPath = await downloadMedia(
        ctx.message.video.file_id,
        group.folder,
        `video_${msgId}.mp4`,
      );
      const placeholder = mediaPath ? `[Video: ${mediaPath}]` : '[Video]';
      storeNonText(ctx, placeholder);
    });

    this.bot.on('message:voice', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      const msgId = ctx.message.message_id;
      const mediaPath = await downloadMedia(
        ctx.message.voice.file_id,
        group.folder,
        `voice_${msgId}.ogg`,
      );
      const placeholder = mediaPath
        ? `[Voice message: ${mediaPath}]`
        : '[Voice message]';
      storeNonText(ctx, placeholder);
    });

    this.bot.on('message:audio', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      const msgId = ctx.message.message_id;
      const fileName = ctx.message.audio.file_name;
      const ext = fileName ? fileName.split('.').pop() || 'mp3' : 'mp3';
      const mediaPath = await downloadMedia(
        ctx.message.audio.file_id,
        group.folder,
        `audio_${msgId}.${ext}`,
      );
      const placeholder = mediaPath ? `[Audio: ${mediaPath}]` : '[Audio]';
      storeNonText(ctx, placeholder);
    });

    this.bot.on('message:document', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      const origName = ctx.message.document?.file_name || 'file';
      const mediaPath = await downloadMedia(
        ctx.message.document.file_id,
        group.folder,
        origName,
      );
      const placeholder = mediaPath
        ? `[Document: ${mediaPath}]`
        : `[Document: ${origName}]`;
      storeNonText(ctx, placeholder);
    });

    this.bot.on('message:sticker', async (ctx) => {
      const chatJid = `tg:${ctx.chat.id}`;
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) return;
      const msgId = ctx.message.message_id;
      const emoji = ctx.message.sticker?.emoji || '';
      const mediaPath = await downloadMedia(
        ctx.message.sticker.file_id,
        group.folder,
        `sticker_${msgId}.webp`,
      );
      const placeholder = mediaPath
        ? `[Sticker: ${mediaPath}]`
        : `[Sticker ${emoji}]`;
      storeNonText(ctx, placeholder);
    });

    this.bot.on('message:location', (ctx) => storeNonText(ctx, '[Location]'));
    this.bot.on('message:contact', (ctx) => storeNonText(ctx, '[Contact]'));

    // Handle errors gracefully
    this.bot.catch((err) => {
      logger.error({ err: err.message }, 'Telegram bot error');
    });

    // Start polling — returns a Promise that resolves when started
    return new Promise<void>((resolve) => {
      this.bot!.start({
        onStart: (botInfo) => {
          logger.info(
            { username: botInfo.username, id: botInfo.id },
            'Telegram bot connected',
          );
          console.log(`\n  Telegram bot: @${botInfo.username}`);
          console.log(
            `  Send /chatid to the bot to get a chat's registration ID\n`,
          );
          resolve();
        },
      });
    });
  }

  private async _sendWithRetry(chatId: string, text: string): Promise<void> {
    const html = markdownToTelegramHtml(text);
    try {
      await this.bot!.api.sendMessage(chatId, html, { parse_mode: 'HTML' });
    } catch (err: any) {
      // Telegram rejected the HTML (e.g. unclosed tag) — retry as plain text
      logger.warn(
        { chatId, err: err?.message },
        'HTML send failed, retrying as plain text',
      );
      await this.bot!.api.sendMessage(chatId, text);
    }
    logger.info({ chatId, length: text.length }, 'Telegram message sent');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.bot) return;
    try {
      const numericId = jid.replace(/^tg:/, '');

      // Smart split at paragraph/line boundaries, avoiding code block mid-cuts
      const chunks = splitMarkdown(text);
      for (const chunk of chunks) {
        await this._sendWithRetry(numericId, chunk);
      }
    } catch (err) {
      logger.warn({ jid, err }, 'Telegram sendMessage failed');
    }
  }

  isConnected(): boolean {
    return this.bot !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('tg:');
  }

  async disconnect(): Promise<void> {
    if (this.bot) {
      this.bot.stop();
      this.bot = null;
      logger.info('Telegram bot stopped');
    }
  }

  async setTyping(jid: string, isTyping: boolean): Promise<void> {
    if (!this.bot || !isTyping) return;
    try {
      const numericId = jid.replace(/^tg:/, '');
      await this.bot.api.sendChatAction(numericId, 'typing');
    } catch (err) {
      logger.debug({ jid, err }, 'Failed to send Telegram typing indicator');
    }
  }
}

registerChannel('telegram', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const token =
    process.env.TELEGRAM_BOT_TOKEN || envVars.TELEGRAM_BOT_TOKEN || '';
  if (!token) {
    logger.warn('Telegram: TELEGRAM_BOT_TOKEN not set');
    return null;
  }
  return new TelegramChannel(token, opts);
});
