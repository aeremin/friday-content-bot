import { Column, Entity, ManyToOne, OneToMany, PrimaryColumn, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class ArticleOnModeration {
  constructor(id: number) {
    this.id = id;
  }

  @PrimaryColumn()
  id: number;

  @OneToMany(type => Vote, vote => vote.article, {cascade: true})
  votes!: Vote[];

  @Column()
  datetime: Date = new Date();
}


@Entity()
export class Vote {
  constructor(articleId: number, voter: number) {
    this.article = new ArticleOnModeration(articleId);
    this.voter = voter;
  }

  @PrimaryGeneratedColumn()
  id!: number;

  @ManyToOne(type => ArticleOnModeration, article => article.votes, {onDelete: 'CASCADE'})
  article!: ArticleOnModeration;

  @Column()
  voter!: number;

  @Column({default: 0})
  upvote: number = 0;   // +1 for upvote

  @Column({default: 0})
  downvote: number = 0;   // +1 for downvote

  @Column({default: 0})
  nonLarp: number = 0;  // +1 for non-LARP vote

  @Column({default: 0})
  nonPublic: number = 0;  // +1 for private vote
}
