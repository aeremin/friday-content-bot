import * as dotenv from 'dotenv';
import { Telegraf } from 'telegraf'
import { Request, Response } from 'express'

dotenv.config();

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN!);

bot.telegram.setWebhook(process.env.WEBHOOK_URL!).then(() => console.log('Webhook set'));

export const botFunction = async (req: Request, res: Response) => {
  try {
    await bot.handleUpdate(req.body)
  } finally {
    res.status(200).end()
  }
}
