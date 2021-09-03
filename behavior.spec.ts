import { addArticle, createVoteMarkup } from './util';

process.env.TELEGRAM_BOT_MODERATOR_CHAT_ID = '129';

import sinon from 'sinon';
import { Telegraf } from 'telegraf';
import { setUpBotBehavior } from './behavior';
import { getConfig } from './config/config';
import {
  createModeratorVoteUpdate,
  createPrivateMessageUpdate,
  kChannelId,
  kModeratorChatId,
  kModeratorChatMessageId,
  kPrivateChatId,
} from './test_helpers';
import { createConnection } from 'typeorm';
import { ArticleOnModeration, Vote } from './entities';

describe('Behaviour test', () => {
  let bot: Telegraf;

  let botMocker: sinon.SinonMock;

  beforeAll(async () => {
    await createConnection({
      type: 'sqljs',
      synchronize: true,
      entities: [ArticleOnModeration, Vote]
    });
    await addArticle(kModeratorChatMessageId);
  })


  beforeEach(() => {
    bot = new Telegraf('111');
    bot.telegram.callApi = ((method, data) => {}) as any;
    // @ts-ignore
    bot.context.tg = bot.telegram
    botMocker = sinon.mock(bot.telegram);

    setUpBotBehavior(bot, {
      ...getConfig(),
      moderatorChatId: kModeratorChatId,
      newsChannelId: kChannelId,
    });
  });

  afterEach(() => {
    botMocker.verify();
  });

  describe('Reporter interaction', () => {
    it('Sending article flow - finished', async () => {
      {
        const expectation = botMocker.expects('sendMessage').withArgs(kModeratorChatId, sinon.match('Awesome news article: http://example.com'));
        expectation.returns({ chat: { id: kModeratorChatId }, message_id: 13 });
        const expectation2 = botMocker.expects('sendMessage').withArgs(kPrivateChatId, sinon.match(/отправлена/));
        await bot.handleUpdate(createPrivateMessageUpdate('Awesome news article: http://example.com'));
        expectation.verify();
        expectation2.verify();
      }
    });
  });

  describe('Moderator interaction', () => {
    it('Got positive votes', async () => {
      const expectation1 = botMocker.expects('editMessageReplyMarkup').once().withExactArgs(kModeratorChatId, kModeratorChatMessageId, undefined, createVoteMarkup({
        upvotes: 1,
        downvotes: 0,
        nonlarper: 0,
        nonpublic: 0,
      }));
      botMocker.expects('answerCbQuery').twice();

      await bot.handleUpdate(createModeratorVoteUpdate(1, 'Good news article', 'upvote'));
      expectation1.verify();

      const expectation2 = botMocker.expects('editMessageReplyMarkup').once().withExactArgs(kModeratorChatId, kModeratorChatMessageId, undefined, createVoteMarkup({
        upvotes: 2,
        downvotes: 0,
        nonlarper: 0,
        nonpublic: 0,
      }));
      await bot.handleUpdate(createModeratorVoteUpdate(2, 'Good news article', 'upvote'));
      expectation2.verify();
    });

    it('Got negative votes, deleting', async () => {
      botMocker.expects('editMessageReplyMarkup').once().withExactArgs(kModeratorChatId, kModeratorChatMessageId, undefined, sinon.match.any);
      botMocker.expects('answerCbQuery').twice();

      await bot.handleUpdate(createModeratorVoteUpdate(1, 'Bad news article', 'nonlarper'));

      botMocker.expects('deleteMessage').withArgs(kModeratorChatId, kModeratorChatMessageId);

      await bot.handleUpdate(createModeratorVoteUpdate(2, 'Bad news article', 'nonlarper'));
    });
  });
});
