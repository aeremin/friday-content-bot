import { BotMessages, getMessages } from './normal';

export type BotConfig = {
  textMessages: BotMessages,
  moderatorChatId: number,
  newsChannelId: number,
};

export function getConfig(): BotConfig {
  const commonConfig = {
    moderatorChatId: Number(process.env.TELEGRAM_BOT_MODERATOR_CHAT_ID),
    newsChannelId: Number(process.env.TELEGRAM_BOT_NEWS_CHANNEL_ID),
  };
  return {
    ...commonConfig,
    textMessages: getMessages(),
  };
}
