import { getLogger } from "../logger";
import { Telegraf, ContextMessageUpdate } from 'telegraf';
import { withCommands } from "./commands";
import { UserService } from "../service/user.service";
import { MessageService } from "../service/message.service";

const Bot = require('telegraf');

const { TELEGRAM_BOT_TOKEN } = process.env;

export const BOT_TOKEN = TELEGRAM_BOT_TOKEN || 'token';

export async function createBot(userService: UserService, messageService: MessageService): Promise<Telegraf<ContextMessageUpdate>> {
    const logger = getLogger('bot');
    let bot: Telegraf<ContextMessageUpdate> = new Bot(BOT_TOKEN);

    bot.catch(logger.error);
    
    bot = withCommands(bot, userService, messageService);

    return bot;
}