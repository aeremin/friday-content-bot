export type BotMessages = {
  THANK_YOU_FOR_ARTICLE: string,
};

export function getMessages(): BotMessages {
  return {
    THANK_YOU_FOR_ARTICLE: 'Готово! Новость отправлена модераторам. Спасибо за помощь!',
  };
}
