import { Context, Telegraf } from 'telegraf'
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { Message, Update } from 'typegram';
import { CallbackQuery } from 'typegram/callback';
import { BotConfig } from './config/config';
import { DatabaseInterface } from './storage';
import {
  createVoteMarkup,
  MessageVotes,
  NewsArticle,
  recalculateVotes,
  Vote,
} from './util';

export function setUpBotBehavior(
  bot: Telegraf,
  votesDb: DatabaseInterface<MessageVotes>,
  articlesDb: DatabaseInterface<NewsArticle>,
  config: BotConfig,
) {
  setUpPing(bot);
  setUpReporterDialog(bot, votesDb, articlesDb, config);
  setUpVoting(bot, votesDb, articlesDb, config);
}

function setUpPing(bot: Telegraf) {
  bot.hears('/ping', async (ctx) => {
    const res = await ctx.reply('Pong!');
    console.log(JSON.stringify(res));
  });
}

function isPrivateMessage(msg: Message): boolean {
  return msg.chat.type == 'private';
}

function anonymouslyForwardMessage(
  chatId: number,
  msg: Message.TextMessage | Message.PhotoMessage,
  options: ExtraReplyMessage,
  ctx: Context,
) {
  if ('text' in msg) {
    return ctx.telegram.sendMessage(
      chatId,
      msg.text,
      options,
    );
  } else if ('photo' in msg) {
    return ctx.telegram.sendPhoto(chatId, msg.photo[0].file_id, {
      ...options,
      caption: msg.caption,
    });
  }
}

function setUpReporterDialog(
  bot: Telegraf,
  votesDb: DatabaseInterface<MessageVotes>,
  articlesDb: DatabaseInterface<NewsArticle>,
  config: BotConfig,
) {

  bot.on('text', async (ctx) => {
    if (!isPrivateMessage(ctx.message)) return;

    const votes = new MessageVotes();
    votes.disallowedToVote.push(ctx.message.from.id);
    const res = await anonymouslyForwardMessage(
      config.moderatorChatId,
      ctx.message,
      { reply_markup: createVoteMarkup(votes) },
      ctx,
    );
    if (!res) {
      console.error('Failed to forward message!');
      return;
    }
    await votesDb.saveDatastoreEntry(
      `${res.chat.id}_${res.message_id}`,
      votes,
    );
    await articlesDb.saveDatastoreEntry(res.message_id.toString(), {
      submitterId: ctx.message.from.id,
      submitterName: `${ctx.message.from.username} (${ctx.message.from.first_name} ${ctx.message.from.last_name})`,
      submissionTime: new Date(),
      wasPublished: false,
      text: ctx.message.text
    });
    await ctx.reply(config.textMessages.THANK_YOU_FOR_ARTICLE);
  });
}

function stringToVote(s: string | undefined): Vote | undefined {
  if (s == '+') return '+';
  if (s == '-') return '-';
  return undefined;
}

const kVotesToApprove = 2;
const kVotesToReject = 3;

// Returns undefined iff failed to update votes (user already participated in the vote, vote cancelled, ...).
async function processVotesUpdate(
  db: DatabaseInterface<MessageVotes>,
  dbKey: string,
  userId: number,
  modifier: string | undefined,
  votesLimits: { votesToApprove: number, votesToReject: number },
): Promise<MessageVotes | undefined> {
  return db.updateDatastoreEntry(dbKey, (votes: MessageVotes | undefined) => {
    const vote = stringToVote(modifier);
    votes = votes || new MessageVotes();
    if (vote && recalculateVotes(votes, userId, vote, votesLimits)) {
      return votes;
    }
    return undefined;
  });
}

function setUpVoting(
  bot: Telegraf,
  votesDb: DatabaseInterface<MessageVotes>,
  articlesDb: DatabaseInterface<NewsArticle>,
  config: BotConfig,
) {
  bot.on('callback_query', async ctx => {
    const query = ctx.callbackQuery as CallbackQuery.DataCallbackQuery;

    if (!query.message) return;

    const isModeratorVoting = query.message.chat.id == config.moderatorChatId;

    const votesToApprove = isModeratorVoting
      ? kVotesToApprove
      : 1000000;

    const votesToReject = isModeratorVoting
      ? kVotesToReject
      : 1000000;

    const dbKey = `${query.message.chat.id}_${query.message.message_id}`;

    const maybeVotes = await processVotesUpdate(
      votesDb,
      dbKey,
      query.from.id,
      query.data,
      { votesToApprove, votesToReject },
    );

    if (maybeVotes) {
      if (maybeVotes.votesAgainst.length >= votesToReject) {
        await ctx.deleteMessage();
      } else if (maybeVotes.votesFor.length >= votesToApprove) {
        const votesInChannel = new MessageVotes();
        const res = await anonymouslyForwardMessage(
          config.newsChannelId,
          query.message as Message.TextMessage | Message.PhotoMessage,
          { reply_markup: createVoteMarkup(votesInChannel) },
          ctx,
        );
        await articlesDb.updateDatastoreEntry(
          query.message.message_id.toString(),
          v => {
            if (v) v.wasPublished = true;
            return v;
          },
        );
        await ctx.deleteMessage();
        if (!res) {
          console.error('Failed to forward message!');
          return;
        }

        await votesDb.saveDatastoreEntry(
          `${res.chat.id}_${res.message_id}`,
          votesInChannel,
        );
      } else {
        await ctx.editMessageReplyMarkup(createVoteMarkup(maybeVotes));
      }
    }

    await ctx.answerCbQuery();
  });
}
