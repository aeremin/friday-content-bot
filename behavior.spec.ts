process.env.TELEGRAM_BOT_MODERATOR_CHAT_ID = '129';

import sinon from 'sinon';
import { Telegraf } from 'telegraf';
import { setUpBotBehavior } from './behavior';
import { getConfig } from './config/config';
import { DatabaseInterface } from './storage';
import {
  createModeratorVoteUpdate,
  createPrivateMessageUpdate,
  createReaderVoteUpdate,
  kChannelId,
  kChannelMessageId,
  kModeratorChatId,
  kModeratorChatMessageId,
  kPrivateChatId,
  kUserId,
} from './test_helpers';
import { MessageVotes, NewsArticle } from './util';

class InMemoryDatabase<T> implements DatabaseInterface<T> {
  private storage: { [key: string]: T } = {};

  public async readDatastoreEntry(dbKey: string): Promise<T | undefined> {
    return this.storage[dbKey];
  }

  public async saveDatastoreEntry(dbKey: string, entity: T): Promise<void> {
    this.storage[dbKey] = entity;
  }

  public async updateDatastoreEntry(dbKey: string, modifier: (v: (T | undefined)) => (T | undefined)): Promise<T | undefined> {
    const updated = modifier(await this.readDatastoreEntry(dbKey));
    if (updated) {
      await this.saveDatastoreEntry(dbKey, updated);
    }
    return updated;
  }
}

describe('Behaviour test', () => {
  let bot: Telegraf;
  let datastoreVotes: DatabaseInterface<MessageVotes> = new InMemoryDatabase<MessageVotes>();
  let datastoreArticles: DatabaseInterface<NewsArticle> = new InMemoryDatabase<NewsArticle>();

  let botMocker: sinon.SinonMock;

  let votesDatastoreMocker: sinon.SinonMock;
  let articlesDatastoreMocker: sinon.SinonMock;

  beforeEach(() => {
    bot = new Telegraf('111');
    bot.telegram.callApi = ((method, data) => {}) as any;
    // @ts-ignore
    bot.context.tg = bot.telegram
    botMocker = sinon.mock(bot.telegram);

    votesDatastoreMocker = sinon.mock(datastoreVotes);
    articlesDatastoreMocker = sinon.mock(datastoreArticles);
    setUpBotBehavior(bot, datastoreVotes, datastoreArticles, {
      ...getConfig(),
      moderatorChatId: kModeratorChatId,
      newsChannelId: kChannelId,
    });
  });

  afterEach(() => {
    botMocker.verify();
    votesDatastoreMocker.verify();
    articlesDatastoreMocker.verify();
  });

  describe('Reporter interaction', () => {
    it('/sendarticle flow - finished', async () => {
      {
        const expectation = botMocker.expects('sendMessage').withArgs(kModeratorChatId, sinon.match('Awesome news article: http://example.com'));
        expectation.returns({ chat: { id: kModeratorChatId }, message_id: 13 });
        const expectation2 = botMocker.expects('sendMessage').withArgs(kPrivateChatId, sinon.match(/отправлена/));
        votesDatastoreMocker.expects('saveDatastoreEntry').withArgs(`${kModeratorChatId}_13`,
          sinon.match({ disallowedToVote: [kUserId], finished: false, votesAgainst: [], votesFor: [] }));
        articlesDatastoreMocker.expects('saveDatastoreEntry').withArgs('13',
          sinon.match({
            submitterId: kUserId,
            submitterName: 'kool_xakep ( undefined)',
            wasPublished: false,
            text: 'Awesome news article: http://example.com',
          }));
        await bot.handleUpdate(createPrivateMessageUpdate('Awesome news article: http://example.com'));
        expectation.verify();
        expectation2.verify();
      }
    });
  });

  describe('Moderator interaction', () => {
    it('Got positive votes, posting to news channel', async () => {
      const votes: MessageVotes = new MessageVotes();
      votesDatastoreMocker.expects('updateDatastoreEntry').twice().callsFake(
        (_: string, modifier) => modifier(votes) ? votes : undefined);

      botMocker.expects('editMessageReplyMarkup').once().withExactArgs(kModeratorChatId, kModeratorChatMessageId, undefined, sinon.match.any);
      botMocker.expects('answerCbQuery').twice();

      await bot.handleUpdate(createModeratorVoteUpdate(1, 'Good news article', '+'));
      expect(votes).toEqual({ disallowedToVote: [], votesFor: [1], votesAgainst: [], finished: false });

      botMocker.expects('sendMessage')
        .withArgs(kChannelId, sinon.match('Good news article'), sinon.match({ reply_markup: {} }))
        .returns({ chat: { id: 999 }, message_id: 111 });
      botMocker.expects('deleteMessage').withArgs(kModeratorChatId, kModeratorChatMessageId);

      votesDatastoreMocker.expects('saveDatastoreEntry').withArgs('999_111',
        sinon.match({ disallowedToVote: [], finished: false, votesAgainst: [], votesFor: [] }));
      articlesDatastoreMocker.expects('updateDatastoreEntry');

      await bot.handleUpdate(createModeratorVoteUpdate(2, 'Good news article', '+'));
      expect(votes).toEqual(
        { disallowedToVote: [], votesFor: [1, 2], votesAgainst: [], finished: true }
      );
    });

    it('Got negative votes, deleting', async () => {
      const votes: MessageVotes = { disallowedToVote: [], votesFor: [], votesAgainst: [], finished: false };
      votesDatastoreMocker.expects('updateDatastoreEntry').thrice().callsFake(
        (_: string, modifier) => modifier(votes) ? votes : undefined);

      botMocker.expects('editMessageReplyMarkup').twice().withExactArgs(kModeratorChatId, kModeratorChatMessageId, undefined, sinon.match.any);
      botMocker.expects('answerCbQuery').thrice();

      await bot.handleUpdate(createModeratorVoteUpdate(1, 'Bad news article', '-'));
      expect(votes).toEqual({ disallowedToVote: [], votesFor: [], votesAgainst: [1], finished: false });

      botMocker.expects('deleteMessage').withArgs(kModeratorChatId, kModeratorChatMessageId);

      await bot.handleUpdate(createModeratorVoteUpdate(2, 'Bad news article', '-'));
      expect(votes).toEqual(
        { disallowedToVote: [], votesFor: [], votesAgainst: [1, 2], finished: false }
      );

      await bot.handleUpdate(createModeratorVoteUpdate(3, 'Bad news article', '-'));
      expect(votes).toEqual(
        { disallowedToVote: [], votesFor: [], votesAgainst: [1, 2, 3], finished: true }
      );
    });
  });

  describe('Reader interaction', () => {
    it('Many readers can vote', async () => {
      const votes: MessageVotes = new MessageVotes();
      votesDatastoreMocker.expects('updateDatastoreEntry').thrice().callsFake(
        (_: string, modifier) => modifier(votes) ? votes : undefined);
      botMocker.expects('editMessageReplyMarkup').thrice().withExactArgs(kChannelId, kChannelMessageId, undefined, sinon.match.any);
      botMocker.expects('answerCbQuery').thrice();

      await bot.handleUpdate(createReaderVoteUpdate(1, 'Bad news article', '-'));
      expect(votes).toEqual({ disallowedToVote: [], votesFor: [], votesAgainst: [1], finished: false });

      await bot.handleUpdate(createReaderVoteUpdate(2, 'Bad news article', '-'));
      expect(votes).toEqual(
        { disallowedToVote: [], votesFor: [], votesAgainst: [1, 2], finished: false }
      );

      await bot.handleUpdate(createReaderVoteUpdate(3, 'Bad news article', '-'));
      expect(votes).toEqual(
        { disallowedToVote: [], votesFor: [], votesAgainst: [1, 2, 3], finished: false }
      );
    });
  });
});
