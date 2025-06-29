import { Injectable, Logger } from '@nestjs/common';
import { SlashCommandBuilder, ChatInputCommandInteraction } from 'discord.js';
import { SubscriberService } from '../subscriber/subscriber.service';
import { KeywordFilter } from '../schemas/subscriber.schema';

interface UnsubscribeResult {
  success: boolean;
  remainingCount: number;
  removedItems: string[];
  remainingFilters: KeywordFilter[];
}

@Injectable()
export class CommandService {
  private readonly logger = new Logger(CommandService.name);

  constructor(private readonly subscriberService: SubscriberService) {}

  private extractErrorCode(error: unknown): string | number | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
      return (error as { code: string | number }).code;
    }
    return undefined;
  }

  createCommands() {
    return [
      new SlashCommandBuilder()
        .setName('subscribe')
        .setDescription('訂閱 MapleStory Artale 廣播訊息（合併模式）')
        .addStringOption((option) =>
          option
            .setName('keywords')
            .setDescription('關鍵字 (用逗號分隔)')
            .setRequired(true),
        )
        .addStringOption((option) =>
          option
            .setName('types')
            .setDescription('訊息類型')
            .setRequired(false)
            .addChoices(
              { name: '收購', value: 'buy' },
              { name: '販售', value: 'sell' },
              { name: '全部', value: 'both' },
            ),
        ),
      new SlashCommandBuilder()
        .setName('unsubscribe')
        .setDescription('取消訂閱 MapleStory Artale 廣播訊息')
        .addStringOption((option) =>
          option
            .setName('keywords')
            .setDescription('要取消的關鍵字 (用逗號分隔，留空表示取消所有)')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('types')
            .setDescription('要取消的訊息類型')
            .setRequired(false)
            .addChoices(
              { name: '收購', value: 'buy' },
              { name: '販售', value: 'sell' },
              { name: '全部', value: 'both' },
            ),
        ),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('查看訂閱狀態'),
    ];
  }

  async handleCommands(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    // 記錄所有指令和用戶資訊 (僅開發環境)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📱 Command: /${commandName}`);
      console.log(`👤 User ID: ${interaction.user.id}`);
      console.log(`👤 Username: ${interaction.user.username}`);
      console.log(`📍 Channel ID: ${interaction.channelId}`);
    }

    try {
      switch (commandName) {
        case 'subscribe':
          await this.handleSubscribe(interaction);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(interaction);
          break;

        case 'status':
          await this.handleStatus(interaction);
          break;
      }
    } catch (error) {
      const errorDetails = {
        commandName,
        userId: interaction.user.id,
        username: interaction.user.username,
        channelId: interaction.channelId,
        guildId: interaction.guildId,
        errorType: (error as Error)?.constructor?.name,
        errorMessage: (error as Error)?.message,
        errorCode: this.extractErrorCode(error),
        stackTrace:
          process.env.NODE_ENV !== 'production'
            ? (error as Error)?.stack
            : undefined,
      };

      this.logger.error(
        `Command execution failed: /${commandName}`,
        errorDetails,
      );

      // 處理互動過期或其他錯誤
      if (!interaction.replied && !interaction.deferred) {
        try {
          await interaction.reply({
            content: '❌ 指令執行時發生錯誤，請稍後再試',
            ephemeral: true,
          });
        } catch (replyError) {
          const replyErrorDetails = {
            originalError: errorDetails,
            replyErrorType: (replyError as Error)?.constructor?.name,
            replyErrorMessage: (replyError as Error)?.message,
            replyErrorCode: this.extractErrorCode(replyError),
          };
          this.logger.error(
            'Failed to reply to interaction after command error',
            replyErrorDetails,
          );
        }
      }
    }
  }

  private async handleSubscribe(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!interaction.channel) {
      await interaction.reply('❌ 無法取得頻道資訊');
      return;
    }

    const keywordsInput = interaction.options.getString('keywords');
    const keywords = keywordsInput
      ? keywordsInput
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      : [];

    // 驗證必須提供至少一個關鍵字
    if (keywords.length === 0) {
      await interaction.reply('❌ 請提供至少一個關鍵字來訂閱特定內容');
      return;
    }

    const typesInput = interaction.options.getString('types');
    let messageTypes = ['buy', 'sell'];
    if (typesInput === 'buy') {
      messageTypes = ['buy'];
    } else if (typesInput === 'sell') {
      messageTypes = ['sell'];
    }

    // 使用 SubscriberService 處理訂閱
    const wasSubscribed = await this.subscriberService.isSubscribed(
      interaction.user.id,
    );

    // 轉換為新的 KeywordFilter 格式
    const keywordFilters = keywords.map((keyword) => ({
      keyword,
      messageTypes,
    }));

    const finalConfig = await this.subscriberService.subscribe({
      userId: interaction.user.id,
      channelId: interaction.channel.id,
      keywordFilters,
    });

    // 生成回覆訊息
    const filterDescriptions = finalConfig.keywordFilters.map((filter) => {
      const typeNames = filter.messageTypes.map((t) =>
        t === 'buy' ? '收購' : '販售',
      );
      return `${filter.keyword} (${typeNames.join(', ')})`;
    });

    const keywordText =
      filterDescriptions.length > 0
        ? `\n🔍 關鍵字過濾器: ${filterDescriptions.join(', ')}`
        : '\n📢 接收所有訊息';

    const action = wasSubscribed ? '更新' : '訂閱';
    await interaction.reply(
      `✅ 已成功${action} MapleStory Artale 廣播訊息！${keywordText}`,
    );
  }

  private async handleUnsubscribe(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const keywordsInput = interaction.options.getString('keywords');
    const typesInput = interaction.options.getString('types');

    // 如果沒有提供任何參數，取消所有訂閱
    if (!keywordsInput && !typesInput) {
      const success = await this.subscriberService.unsubscribe(
        interaction.user.id,
      );
      if (success) {
        await interaction.reply('❌ 已取消訂閱 MapleStory Artale 廣播訊息');
      } else {
        await interaction.reply('❓ 您尚未訂閱任何廣播訊息');
      }
      return;
    }

    // 處理部分取消訂閱
    const keywords = keywordsInput
      ? keywordsInput
          .split(',')
          .map((k) => k.trim())
          .filter((k) => k.length > 0)
      : [];

    let messageTypes: string[] = [];
    if (typesInput === 'buy') {
      messageTypes = ['buy'];
    } else if (typesInput === 'sell') {
      messageTypes = ['sell'];
    } else if (typesInput === 'both') {
      messageTypes = ['buy', 'sell'];
    }
    // 如果沒有指定 types，messageTypes 保持空陣列

    const result: UnsubscribeResult =
      await this.subscriberService.partialUnsubscribe(
        interaction.user.id,
        keywords,
        messageTypes,
      );

    if (result.success) {
      const removedItems = result.removedItems || [];
      let message = `✅ 已成功取消訂閱：${removedItems.join(', ')}`;

      if (result.remainingCount === 0) {
        message += '\n🔴 已完全取消所有訂閱';
      } else {
        // 顯示剩餘的過濾器
        const remainingFilters = result.remainingFilters || [];
        const remainingDescriptions = remainingFilters.map((filter) => {
          const typeNames = filter.messageTypes.map((t) =>
            t === 'buy' ? '收購' : '販售',
          );
          return `${filter.keyword} (${typeNames.join(', ')})`;
        });
        message += `\n\n📋 剩餘訂閱：\n🔍 ${remainingDescriptions.join('\n🔍 ')}`;
      }

      await interaction.reply(message);
    } else {
      await interaction.reply('❓ 沒有找到匹配的訂閱內容可以取消');
    }
  }

  private async handleStatus(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    // 🚨 立即 defer，避免 WebSocket 事件阻塞導致超時
    await interaction.deferReply({ ephemeral: true });

    if (process.env.NODE_ENV !== 'production') {
      console.log('=== STATUS COMMAND START ===');
      console.log('User ID:', interaction.user.id);
    }

    try {
      const userConfig = await this.subscriberService.getSubscription(
        interaction.user.id,
      );
      const isSubscribed = !!userConfig;

      let description = isSubscribed ? '✅ 已訂閱' : '❌ 未訂閱';
      if (isSubscribed && userConfig?.keywordFilters?.length) {
        if (process.env.NODE_ENV !== 'production') {
          console.log('User subscription config:', userConfig);
        }
        const filterDescriptions = userConfig.keywordFilters.map((filter) => {
          const typeNames = filter.messageTypes.map((t) =>
            t === 'buy' ? '收購' : '販售',
          );
          return `${filter.keyword} (${typeNames.join(', ')})`;
        });
        description += `\n🔍 關鍵字過濾器: ${filterDescriptions.join(', ')}`;
        if (process.env.NODE_ENV !== 'production') {
          console.log('Filter descriptions:', filterDescriptions);
        }
      }

      await interaction.editReply({ content: description });
      if (process.env.NODE_ENV !== 'production') {
        console.log('Reply sent successfully');
      }
    } catch (error) {
      const errorDetails = {
        userId: interaction.user.id,
        errorType: (error as Error)?.constructor?.name,
        errorMessage: (error as Error)?.message,
        stackTrace:
          process.env.NODE_ENV !== 'production'
            ? (error as Error)?.stack
            : undefined,
      };

      this.logger.error('Error in handleStatus command', errorDetails);

      try {
        await interaction.editReply({ content: '❌ 查詢狀態時發生錯誤' });
      } catch (editError) {
        const editErrorDetails = {
          originalError: errorDetails,
          editErrorType: (editError as Error)?.constructor?.name,
          editErrorMessage: (editError as Error)?.message,
        };
        this.logger.error(
          'Failed to edit reply in status command',
          editErrorDetails,
        );
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      console.log('=== STATUS COMMAND END ===');
    }
  }
}
