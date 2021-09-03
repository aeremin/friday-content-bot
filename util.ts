import { InlineKeyboardMarkup } from 'typegram'
import { getRepository } from 'typeorm';
import { ArticleOnModeration, Vote } from './entities';

export type VoteType = 'upvote' | 'downvote' | 'nonlarper' | 'nonpublic';

export async function addVote(articleId: number, voterId: number, voteType: VoteType): Promise<void> {
  const vote = await getRepository(Vote).findOne({
    where: {
      article: new ArticleOnModeration(articleId),
      voter: voterId,
    },
  }) ?? new Vote(articleId, voterId);

  vote.upvote = voteType == 'upvote' ? 1 : 0;
  vote.downvote = voteType == 'downvote' ? 1 : 0;
  vote.nonLarp = voteType == 'nonlarper' ? 1 : 0;
  vote.nonPublic = voteType == 'nonpublic' ? 1 : 0;

  await getRepository(Vote).save(vote);
}

export async function addArticle(articleId: number): Promise<void> {
  const article = new ArticleOnModeration(articleId);
  article.datetime = new Date();
  article.votes = [];
  await getRepository(ArticleOnModeration).save(article);
}

export async function deleteArticle(articleId: number): Promise<void> {
  await getRepository(ArticleOnModeration)
    .createQueryBuilder("article")
    .where("id = :id", { id: articleId })
    .delete()
    .execute();
}

export async function bestArticle(): Promise<ArticleOnModeration | undefined> {
  const result = await getRepository(ArticleOnModeration)
    .createQueryBuilder("article")
    .leftJoin("article.votes", "vote")
    .select("article.id", "id")
    .addSelect("MIN(article.datetime)", "datetime")
    .addSelect("SUM(vote.upvote) - SUM(vote.downvote)", "upvotes")
    .addSelect("COUNT(vote.id)", "count")
    .groupBy("article.id")
    .orderBy({
      upvotes: "DESC",
      count: "DESC",
      datetime: "ASC",
    })
    .limit(1)
    .getRawOne();
  return result.id;
}

export interface TotalVotes {
  upvotes: number;
  downvotes: number;
  nonlarper: number;
  nonpublic: number;
}

export async function totalVotes(articleId: number): Promise<TotalVotes> {
  return await getRepository(ArticleOnModeration)
      .createQueryBuilder("article")
      .leftJoin("article.votes", "vote")
      .where("article.id = :id", { id: articleId })
      .select("SUM(vote.upvote)", "upvotes")
      .addSelect("SUM(vote.downvote)", "downvotes")
      .addSelect("SUM(vote.nonLarp)", "nonlarper")
      .addSelect("SUM(vote.nonPublic)", "nonpublic")
      .getRawOne() ??
    {
      upvotes: 0,
      downvotes: 0,
      nonpublic: 0,
      nonlarper: 0
    };
}

export function createVoteMarkup(votes: TotalVotes): InlineKeyboardMarkup {
  return {
    inline_keyboard: [[
      {
        text: `👍 (${votes.upvotes})`,
        callback_data: 'upvote',
      },
      {
        text: `👎 (${votes.downvotes})`,
        callback_data: 'downvote',
      },
    ], [
      {
        text: `👎 Не ролевик (${votes.nonlarper})`,
        callback_data: 'nonlarper',
      },
      {
        text: `👎 Не публично (${votes.nonpublic})`,
        callback_data: 'nonpublic',
      },
    ]],
  };
}

export function extractFirstUrl(msg: string): string | undefined {
  const httpRe = /(http|ftp|https):\/\/([\w_-]+(?:(?:\.[\w_-]+)+))([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?/;
  const reMatch = msg.match(httpRe);
  if (reMatch) {
    return reMatch[0];
  } else {
    return undefined;
  }
}

