/// <reference path="../../telegraf.d.ts" />
import WizardScene from 'telegraf/scenes/wizard'
import { Markup } from 'telegraf';
import { Provider, inject } from '@loopback/context';
import { logger, Loggable, Logger } from '../../../logging';
import { repository } from '@loopback/repository';
import { UserRepository, BookmarkRepository, BookmarkCollectionRepository } from '../../../repositories';
import { Collection, Bookmark, BookmarkCollection } from '../../../models';
import { TelegramBindings } from '../../keys';
import RedisSession from 'telegraf-session-redis';

@logger()
export class SaveBookmarksSceneProvider implements Provider<WizardScene>, Loggable {
    logger: Logger;

    constructor(
        @repository(UserRepository) private userRepository: UserRepository,
        @repository(BookmarkRepository) private bookmarkRepository: BookmarkRepository,
        @repository(BookmarkCollectionRepository) private joinRepository: BookmarkCollectionRepository,
    ) { }

    value(): WizardScene {
        return new WizardScene('save-bookmark',
            async (ctx) => {
                this.logger.warn('Session', ctx.session);
                const { entities, text } = ctx.message!;
                const entity = entities!.find((e) => e.type === 'url')!;
                ctx.session.messageLink = text!.substring(entity.offset, (entity.offset + entity.length))
                const collections = await this.userRepository.collections(ctx.from!.id).find();
                ctx.session.collections = collections;
                const buttons = collections.map(({ title, slug }) => Markup.callbackButton(title, slug));

                ctx.reply(ctx.i18n.t('bookmarks.save.step1'), Markup.inlineKeyboard([
                    ...buttons,
                    Markup.callbackButton(ctx.i18n.t('cancel'), 'cancel')
                    // @ts-ignore
                ]).extra())
                return ctx.wizard.next();
            },
            async (ctx) => {
                this.logger.warn('Session', ctx.session);
                if (!ctx.callbackQuery) {
                    ctx.reply('Nope');
                    return ctx.wizard.back();
                }
                const slug = ctx.callbackQuery.data;
                if (slug === 'cancel') {
                    ctx.reply(ctx.i18n.t('bye'));
                    ctx.session = {};
                    return ctx.scene.leave();
                }
                ctx.answerCbQuery();
                const collection = (ctx.session.collections || []).find((collection: Collection) => collection.slug === slug);
                if (!collection) {
                    ctx.reply(ctx.i18n.t('errors.empty', { entity: 'collection', id: slug }))
                    return ctx.scene.leave();
                }
                delete ctx.session.collections;
                ctx.session.collectionId = collection.id;
                ctx.reply(ctx.i18n.t('bookmarks.save.step2.question', { collection: collection.title }), Markup.inlineKeyboard([
                    Markup.callbackButton(ctx.i18n.t('bookmarks.save.step2.yes'), 'yes'),
                    Markup.callbackButton(ctx.i18n.t('bookmarks.save.step2.no'), 'no'),
                    // @ts-ignore
                ]).extra());
                return ctx.wizard.next();
            },
            async (ctx) => {
                if (!ctx.callbackQuery) {
                    ctx.reply('Nope');
                    return ctx.wizard.back();
                }
                const bookmark = await this.bookmarkRepository.create(new Bookmark({ 
                    userId: ctx.from!.id, 
                    messageLink: ctx.session.messageLink,
                }));
                await this.joinRepository.create(new BookmarkCollection({
                    bookmarkId: bookmark.id,
                    collectionId: ctx.session.collectionId,
                }));
                ctx.answerCbQuery();
                if (ctx.callbackQuery.data === 'yes') {
                    ctx.session.bookmark = bookmark;
                    ctx.reply(ctx.i18n.t('bookmarks.save.step3.yes'));
                    return ctx.wizard.next();
                }

                ctx.reply(ctx.i18n.t('bookmarks.save.step3.no'));
                ctx.session = null;
                return ctx.scene.leave();
            },
            async (ctx) => {
                const name = ctx.message!.text;
                const bookmark = new Bookmark(ctx.session.bookmark);
                bookmark.name = name;
                await this.bookmarkRepository.update(bookmark);

                ctx.reply(ctx.i18n.t('bookmarks.save.conclusion', { bookmark: name }));
                ctx.session = null;
                return ctx.scene.leave();
            }
        );
    }
}


