import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import * as WebSocket from 'ws';
import { EmbedBuilder } from 'discord.js';
import { DatabaseService } from '../database/database.service';
import { DiscordService } from '../discord/discord.service';
import { KeywordFilter } from '../schemas/subscriber.schema';

interface ArtaleMessage {
  type: string;
  payload?: {
    message_type: string;
    channel: string;
    player_name: string;
    player_id: string;
    content: string;
  };
  request_id?: string;
}

@Injectable()
export class WebSocketService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebSocketService.name);
  private ws: WebSocket;
  private pingInterval: NodeJS.Timeout;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly discordService: DiscordService,
  ) {}

  private extractErrorCode(error: unknown): string | number | undefined {
    if (error && typeof error === 'object' && 'code' in error) {
      return (error as { code: string | number }).code;
    }
    return undefined;
  }

  private extractErrorStatus(error: unknown): string | number | undefined {
    if (error && typeof error === 'object' && 'status' in error) {
      return (error as { status: string | number }).status;
    }
    return undefined;
  }

  onModuleInit() {
    // 等待 Discord 客户端准备就绪后再连接 WebSocket
    setTimeout(() => {
      this.connect();
    }, 5000);
  }

  onModuleDestroy() {
    this.disconnect();
  }

  private connect() {
    this.ws = new WebSocket('wss://api.artale-love.com/ws/broadcasts');

    this.ws.on('open', () => {
      this.logger.log('Connected to Artale WebSocket');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        let dataString: string;
        if (Buffer.isBuffer(data)) {
          dataString = data.toString('utf8');
        } else if (Array.isArray(data)) {
          dataString = Buffer.concat(data).toString('utf8');
        } else {
          dataString = data as string;
        }
        const message: ArtaleMessage = JSON.parse(dataString) as ArtaleMessage;
        void this.handleMessage(message);
      } catch (error) {
        this.logger.error('Failed to parse WebSocket message:', error);
      }
    });

    this.ws.on('close', () => {
      this.logger.warn(
        'WebSocket connection closed, reconnecting in 5 seconds...',
      );
      if (this.pingInterval) {
        clearInterval(this.pingInterval);
      }
      // 重连
      setTimeout(() => this.connect(), 5000);
    });

    this.ws.on('error', (error) => {
      this.logger.error('WebSocket error:', error);
    });
  }

  private handleMessage(message: ArtaleMessage) {
    this.logger.debug(`Received WebSocket message: ${JSON.stringify(message)}`);

    switch (message.type) {
      case 'connection_info':
        this.logger.log('Connection established');
        this.subscribeToNewMessages();
        break;

      case 'subscription_confirmed':
        this.logger.log('Subscription confirmed');
        this.startPingInterval();
        break;

      case 'pong':
        this.logger.debug('Received pong');
        break;

      case 'new_message':
        if (message.payload) {
          this.logger.log('Broadcasting new message to Discord');
          void this.broadcastToDiscord(message.payload);
        }
        break;

      default:
        this.logger.warn(`Unknown message type: ${message.type}`);
    }
  }

  private subscribeToNewMessages() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const subscribeMessage = {
        type: 'subscribe_new',
        request_id: this.generateRequestId(),
      };
      this.ws.send(JSON.stringify(subscribeMessage));
      this.logger.log('Sent subscription request');
    }
  }

  private startPingInterval() {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = {
          type: 'ping',
          request_id: this.generateRequestId(),
        };
        this.ws.send(JSON.stringify(pingMessage));
        this.logger.debug('Sent ping');
      }
    }, 30000);
  }

  private async broadcastToDiscord(payload: ArtaleMessage['payload']) {
    if (!payload) {
      this.logger.error('Payload is undefined');
      return;
    }

    const messageType = payload.message_type === 'buy' ? '🛒 收購' : '💰 販售';
    const player = `${payload.player_name}#${payload.player_id}`;

    const subscribers = await this.databaseService.getAllSubscribers();
    const client = this.discordService.getClient();

    // 按 Discord 頻道分組符合條件的用戶，並記錄訂閱原因
    const channelToUsersWithReasons = new Map<
      string,
      Array<{ userId: string; reason: string }>
    >();

    for (const [userId, userConfig] of subscribers) {
      try {
        const channelId = userConfig.channelId;
        const keywordFilters = userConfig.keywordFilters;
        const matchedReasons: string[] = [];

        // 檢查關鍵字過濾器
        if (keywordFilters && keywordFilters.length > 0) {
          keywordFilters.forEach((filter: KeywordFilter) => {
            // 檢查訊息類型是否在這個關鍵字的允許清單中
            const messageTypeMatches = filter.messageTypes.includes(
              payload.message_type,
            );
            // 檢查關鍵字是否匹配
            const keywordMatches = payload.content
              .toLowerCase()
              .includes(filter.keyword.toLowerCase());

            if (messageTypeMatches && keywordMatches) {
              const typeText = payload.message_type === 'buy' ? '收購' : '販售';
              matchedReasons.push(`${filter.keyword} (${typeText})`);
            }
          });
        }

        if (matchedReasons.length > 0) {
          if (!channelToUsersWithReasons.has(channelId)) {
            channelToUsersWithReasons.set(channelId, []);
          }
          channelToUsersWithReasons.get(channelId)!.push({
            userId,
            reason: matchedReasons.join(', '),
          });
        }
      } catch (error) {
        this.logger.error(`Failed to process subscriber ${userId}:`, error);
      }
    }

    // 為每個 Discord 頻道發送一條訊息，包含所有相關用戶的提及和訂閱原因
    for (const [channelId, usersWithReasons] of channelToUsersWithReasons) {
      try {
        const channel = await client.channels.fetch(channelId);
        if (channel && channel.isTextBased() && 'send' in channel) {
          // 將提及和訂閱原因合併在一起
          const mentionsWithReasons = usersWithReasons
            .map((user) => `<@${user.userId}> - ${user.reason}`)
            .join('\n');

          // 建立簡潔的 embed，不包含額外的訂閱原因欄位
          const embed = new EmbedBuilder()
            .setTitle(`${messageType} - ${payload.channel}`)
            .setDescription(`### ${payload.content}`)
            .addFields({ name: 'Player', value: player, inline: true })
            .setColor(payload.message_type === 'buy' ? 0x3498db : 0xe74c3c);

          await channel.send({
            content: mentionsWithReasons,
            embeds: [embed],
          });

          this.logger.log(
            `Sent message to channel ${channelId} with ${usersWithReasons.length} mentions and reasons`,
          );
        }
      } catch (error) {
        const errorDetails = {
          channelId,
          messageType: payload.message_type,
          channel: payload.channel,
          player: payload.player_name,
          contentPreview: payload.content?.substring(0, 100),
          mentionCount: usersWithReasons.length,
          errorType: (error as Error)?.constructor?.name,
          errorMessage: (error as Error)?.message,
          errorCode: this.extractErrorCode(error),
          httpStatus: this.extractErrorStatus(error),
          stackTrace:
            process.env.NODE_ENV !== 'production'
              ? (error as Error)?.stack
              : undefined,
        };

        this.logger.error(
          `Failed to send message to Discord channel ${channelId}`,
          errorDetails,
        );
      }
    }
  }

  private generateRequestId(): string {
    return (
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  disconnect() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    if (this.ws) {
      this.ws.close();
    }
  }
}
