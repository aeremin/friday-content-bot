import * as dotenv from 'dotenv';
import { Telegraf } from 'telegraf'
import { Request, Response } from 'express'
import { setUpBotBehavior } from './behavior';
import { getConfig } from './config/config';
import { ConnectionOptions, createConnection } from 'typeorm';
import { ArticleOnModeration, Vote } from './entities';

dotenv.config();

const options: ConnectionOptions = {
  type: 'mssql',
  database: process.env.DATABASE_NAME!,
  host: process.env.DB_SERVICE_HOST!,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD!,
  synchronize: true,
  extra: {
    trustServerCertificate: true,
  },
  entities: [ArticleOnModeration, Vote]
};

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

async function main() {
  await createConnection(options);
  setUpBotBehavior(bot, getConfig());

  if (process.env.WEBHOOK_URL) {
    bot.telegram.setWebhook(process.env.WEBHOOK_URL!).then(() => console.log('Webhook set'));
  } else {
    await bot.launch();
  }
}

main().then(() => console.log('Success!')).catch((err) => console.error(err));

export const botFunction = async (req: Request, res: Response) => {
  try {
    await bot.handleUpdate(req.body)
  } finally {
    res.status(200).end()
  }
}
