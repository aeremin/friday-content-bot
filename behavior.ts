import { Context, Telegraf } from 'telegraf'
import { ExtraReplyMessage } from 'telegraf/typings/telegram-types';
import { Message } from 'typegram';
import { CallbackQuery } from 'typegram/callback';
import { BotConfig } from './config/config';
import {
  addArticle, addVote,
  createVoteMarkup, deleteArticle, totalVotes, VoteType,
} from './util';

export function setUpBotBehavior(
  bot: Telegraf,
  config: BotConfig,
) {
  setUpPing(bot);
  setUpReporterDialog(bot, config);
  setUpVoting(bot, config);
}

function setUpPing(bot: Telegraf) {
  bot.hears('/ping', async (ctx) => {
    const res = await ctx.reply(`Pong! Current chat is ${ctx.message.chat.id}`);
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
  config: BotConfig,
) {

  bot.on('text', async (ctx) => {
    if (!isPrivateMessage(ctx.message)) return;

    const res = await anonymouslyForwardMessage(
      config.moderatorChatId,
      ctx.message,
      { reply_markup: createVoteMarkup({upvotes: 0, downvotes: 0, nonpublic: 0, nonlarper: 0}) },
      ctx,
    );
    if (!res) {
      console.error('Failed to forward message!');
      return;
    }

    await addArticle(res.message_id);

    await ctx.reply(config.textMessages.THANK_YOU_FOR_ARTICLE);
  });
}

function setUpVoting(
  bot: Telegraf,
  config: BotConfig,
) {
  bot.on('callback_query', async ctx => {
    const query = ctx.callbackQuery as CallbackQuery.DataCallbackQuery;

    if (!query.message) return;

    const voteType = query.data as VoteType;

    const isModeratorVoting = query.message.chat.id == config.moderatorChatId;
    if (!isModeratorVoting) return;

    await addVote(query.message.message_id, query.from.id, voteType);
    const votes = await totalVotes(query.message.message_id);
    if (votes.nonpublic >= 2 || votes.nonlarper >= 2) {
      await Promise.all([
        ctx.deleteMessage(),
        deleteArticle(query.message.message_id),
      ])
    } else {
      await ctx.editMessageReplyMarkup(createVoteMarkup(votes));
    }
    await ctx.answerCbQuery();
  });
}
