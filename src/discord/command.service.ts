import { Injectable } from '@nestjs/common';
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
} from 'discord.js';
import { SubscriberService } from '../subscriber/subscriber.service';

@Injectable()
export class CommandService {
  constructor(private readonly subscriberService: SubscriberService) {}

  createCommands() {
    return [
      new SlashCommandBuilder()
        .setName('subscribe')
        .setDescription('訂閱 MapleStory Artale 廣播訊息（合併模式）')
        .addStringOption((option) =>
          option
            .setName('keywords')
            .setDescription('關鍵字 (用逗號分隔，留空表示接收所有訊息)')
            .setRequired(false),
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
        .setDescription('取消訂閱 MapleStory Artale 廣播訊息'),
      new SlashCommandBuilder()
        .setName('status')
        .setDescription('查看訂閱狀態'),
      new SlashCommandBuilder()
        .setName('reset')
        .setDescription('重置所有訂閱設定'),
      new SlashCommandBuilder()
        .setName('listkeywords')
        .setDescription('查看所有關鍵字'),
      new SlashCommandBuilder()
        .setName('listtypes')
        .setDescription('查看訊息類型清單'),
    ];
  }

  async handleCommands(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

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

      case 'reset':
        await this.handleReset(interaction);
        break;

      case 'listkeywords':
        await this.handleListKeywords(interaction);
        break;

      case 'listtypes':
        await this.handleListTypes(interaction);
        break;
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

    const typesInput = interaction.options.getString('types');
    let messageTypes = ['buy', 'sell'];
    if (typesInput === 'buy') {
      messageTypes = ['buy'];
    } else if (typesInput === 'sell') {
      messageTypes = ['sell'];
    }

    // 使用 SubscriberService 處理訂閱
    const wasSubscribed = this.subscriberService.isSubscribed(
      interaction.user.id,
    );

    // 為了向後兼容，使用 legacy 方法
    const finalConfig = await this.subscriberService.subscribeLegacy({
      userId: interaction.user.id,
      channelId: interaction.channel.id,
      keywords,
      messageTypes,
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
    const success = await this.subscriberService.unsubscribe(
      interaction.user.id,
    );
    if (success) {
      await interaction.reply('❌ 已取消訂閱 MapleStory Artale 廣播訊息');
    } else {
      await interaction.reply('❓ 您尚未訂閱任何廣播訊息');
    }
  }

  private async handleStatus(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const userConfig = this.subscriberService.getSubscription(
      interaction.user.id,
    );
    const isSubscribed = !!userConfig;

    let description = isSubscribed ? '✅ 已訂閱' : '❌ 未訂閱';
    if (isSubscribed) {
      if (userConfig.keywordFilters && userConfig.keywordFilters.length > 0) {
        const filterDescriptions = userConfig.keywordFilters.map((filter) => {
          const typeNames = filter.messageTypes.map((t) =>
            t === 'buy' ? '收購' : '販售',
          );
          return `${filter.keyword} (${typeNames.join(', ')})`;
        });
        description += `\n🔍 關鍵字過濾器: ${filterDescriptions.join(', ')}`;
      } else if (userConfig.keywords && userConfig.keywords.length > 0) {
        // 向後兼容舊格式
        description += `\n🔍 關鍵字: ${userConfig.keywords.join(', ')}`;
        const typeNames = userConfig.messageTypes!.map((t) =>
          t === 'buy' ? '收購' : '販售',
        );
        description += `\n📋 類型: ${typeNames.join(', ')}`;
      } else {
        description += '\n📢 接收所有訊息';
      }
    }

    const statusEmbed = new EmbedBuilder()
      .setTitle('訂閱狀態')
      .setDescription(description)
      .setColor(isSubscribed ? 0x00ae86 : 0xff0000);
    await interaction.reply({ embeds: [statusEmbed] });
  }

  private async handleReset(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const success = await this.subscriberService.reset(interaction.user.id);
    if (success) {
      await interaction.reply('🔄 已重置所有訂閱設定');
    } else {
      await interaction.reply('❓ 您尚未訂閱任何廣播訊息');
    }
  }

  private async handleListKeywords(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const userConfig = this.subscriberService.getSubscription(
      interaction.user.id,
    );

    if (!userConfig) {
      await interaction.reply('❓ 請先使用 /subscribe 訂閱廣播訊息');
      return;
    }

    let keywordsList: string;
    if (userConfig.keywordFilters && userConfig.keywordFilters.length > 0) {
      const filterDescriptions = userConfig.keywordFilters.map((filter) => {
        const typeNames = filter.messageTypes.map((t) =>
          t === 'buy' ? '收購' : '販售',
        );
        return `${filter.keyword} (${typeNames.join(', ')})`;
      });
      keywordsList = filterDescriptions.join('\n• ');
    } else if (userConfig.keywords && userConfig.keywords.length > 0) {
      // 向後兼容舊格式
      keywordsList = userConfig.keywords.join('\n• ');
    } else {
      keywordsList = '無 (接收所有訊息)';
    }

    const listEmbed = new EmbedBuilder()
      .setTitle('🔍 關鍵字清單')
      .setDescription(
        keywordsList !== '無 (接收所有訊息)'
          ? `• ${keywordsList}`
          : keywordsList,
      )
      .setColor(0x3498db);
    await interaction.reply({ embeds: [listEmbed] });
  }

  private async handleListTypes(
    interaction: ChatInputCommandInteraction,
  ): Promise<void> {
    const userConfig = this.subscriberService.getSubscription(
      interaction.user.id,
    );

    if (!userConfig) {
      await interaction.reply('❓ 請先使用 /subscribe 訂閱廣播訊息');
      return;
    }

    let typesDescription: string;

    if (userConfig.keywordFilters && userConfig.keywordFilters.length > 0) {
      // 新格式：顯示每個關鍵字的訊息類型
      const filterDescriptions = userConfig.keywordFilters.map((filter) => {
        const typeNames = filter.messageTypes.map((t) =>
          t === 'buy' ? '收購' : '販售',
        );
        return `${filter.keyword}: ${typeNames.join(', ')}`;
      });
      typesDescription =
        filterDescriptions.length > 0
          ? `• ${filterDescriptions.join('\n• ')}`
          : '無';
    } else if (userConfig.messageTypes && userConfig.messageTypes.length > 0) {
      // 向後兼容舊格式
      const listTypeNames = userConfig.messageTypes.map((t) =>
        t === 'buy' ? '收購' : '販售',
      );
      typesDescription =
        listTypeNames.length > 0 ? `• ${listTypeNames.join('\n• ')}` : '無';
    } else {
      typesDescription = '無';
    }

    const typesEmbed = new EmbedBuilder()
      .setTitle('📋 訊息類型清單')
      .setDescription(typesDescription)
      .setColor(0x9b59b6);
    await interaction.reply({ embeds: [typesEmbed] });
  }
}
