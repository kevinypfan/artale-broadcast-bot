import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KeywordFilter } from '../schemas/subscriber.schema';

export interface SubscriptionRequest {
  userId: string;
  channelId: string;
  keywordFilters: KeywordFilter[];
}

export interface SubscriberConfig {
  channelId: string;
  keywordFilters: KeywordFilter[];
}

@Injectable()
export class SubscriberService {
  private readonly logger = new Logger(SubscriberService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async subscribe(request: SubscriptionRequest): Promise<SubscriberConfig> {
    const { userId, channelId, keywordFilters } = request;

    // 檢查是否已有訂閱
    const existingConfig = await this.databaseService.getSubscriber(userId);
    const shouldMerge = !!existingConfig;

    let finalKeywordFilters = keywordFilters;

    if (shouldMerge && existingConfig) {
      // 合併關鍵字過濾器
      finalKeywordFilters = this.mergeKeywordFilters(
        existingConfig.keywordFilters || [],
        keywordFilters,
      );

      this.logger.log(`Merging subscription for user ${userId}`, {
        existingFilters: existingConfig.keywordFilters,
        newFilters: keywordFilters,
        finalFilters: finalKeywordFilters,
      });
    } else {
      this.logger.log(`Creating new subscription for user ${userId}`, {
        keywordFilters: finalKeywordFilters,
      });
    }

    // 保存到資料庫
    await this.databaseService.saveSubscriberWithFilters(
      userId,
      channelId,
      finalKeywordFilters,
      shouldMerge,
    );

    return {
      channelId,
      keywordFilters: finalKeywordFilters,
    };
  }

  async unsubscribe(userId: string): Promise<boolean> {
    const existingConfig = await this.databaseService.getSubscriber(userId);

    if (!existingConfig) {
      this.logger.warn(`Attempted to unsubscribe non-existent user: ${userId}`);
      return false;
    }

    await this.databaseService.removeSubscriber(userId);
    this.logger.log(`Unsubscribed user: ${userId}`);
    return true;
  }

  async partialUnsubscribe(
    userId: string,
    keywords: string[],
    messageTypes: string[],
  ): Promise<{
    success: boolean;
    remainingCount: number;
    removedItems: string[];
    remainingFilters: KeywordFilter[];
  }> {
    const existingConfig = await this.databaseService.getSubscriber(userId);

    if (!existingConfig) {
      this.logger.warn(
        `Attempted to unsubscribe from non-existent user: ${userId}`,
      );
      return {
        success: false,
        remainingCount: 0,
        removedItems: [],
        remainingFilters: [],
      };
    }

    if (
      !existingConfig.keywordFilters ||
      existingConfig.keywordFilters.length === 0
    ) {
      this.logger.warn(`User ${userId} has no subscriptions to remove`);
      return {
        success: false,
        remainingCount: 0,
        removedItems: [],
        remainingFilters: [],
      };
    }

    let updatedFilters = [...existingConfig.keywordFilters];
    let hasChanges = false;
    const removedItems: string[] = [];

    // 如果指定了關鍵字，只處理這些關鍵字
    if (keywords.length > 0) {
      const keywordsLower = keywords.map((k) => k.toLowerCase());

      updatedFilters = updatedFilters
        .map((filter) => {
          if (keywordsLower.includes(filter.keyword.toLowerCase())) {
            // 如果沒有指定訊息類型，完全移除該關鍵字
            if (messageTypes.length === 0) {
              hasChanges = true;
              removedItems.push(`${filter.keyword} (全部)`);
              return null;
            }

            // 移除指定的訊息類型
            const remainingTypes = filter.messageTypes.filter(
              (type) => !messageTypes.includes(type),
            );

            const removedTypes = filter.messageTypes.filter((type) =>
              messageTypes.includes(type),
            );

            if (remainingTypes.length === 0) {
              // 如果沒有剩餘類型，標記為刪除
              hasChanges = true;
              removedItems.push(`${filter.keyword} (全部)`);
              return null;
            } else if (remainingTypes.length !== filter.messageTypes.length) {
              // 部分移除訊息類型
              hasChanges = true;
              const removedTypeNames = removedTypes.map((t) =>
                t === 'buy' ? '收購' : '販售',
              );
              removedItems.push(
                `${filter.keyword} (${removedTypeNames.join(', ')})`,
              );
              this.logger.log(
                `Partial removal for keyword "${filter.keyword}": [${filter.messageTypes.join(', ')}] -> [${remainingTypes.join(', ')}]`,
              );
              return {
                keyword: filter.keyword, // 確保 keyword 被正確複製
                messageTypes: remainingTypes,
              };
            }
          }
          return filter;
        })
        .filter((filter) => filter !== null);
    } else {
      // 沒有指定關鍵字，必須指定訊息類型才有意義
      if (messageTypes.length === 0) {
        this.logger.warn(
          `User ${userId} tried to unsubscribe without specifying keywords or message types`,
        );
        return {
          success: false,
          remainingCount: existingConfig.keywordFilters.length,
          removedItems: [],
          remainingFilters: existingConfig.keywordFilters,
        };
      }

      // 處理所有關鍵字的指定訊息類型
      updatedFilters = updatedFilters
        .map((filter) => {
          const remainingTypes = filter.messageTypes.filter(
            (type) => !messageTypes.includes(type),
          );

          const removedTypes = filter.messageTypes.filter((type) =>
            messageTypes.includes(type),
          );

          if (remainingTypes.length === 0) {
            hasChanges = true;
            removedItems.push(`${filter.keyword} (全部)`);
            return null;
          } else if (remainingTypes.length !== filter.messageTypes.length) {
            hasChanges = true;
            const removedTypeNames = removedTypes.map((t) =>
              t === 'buy' ? '收購' : '販售',
            );
            removedItems.push(
              `${filter.keyword} (${removedTypeNames.join(', ')})`,
            );
            return { keyword: filter.keyword, messageTypes: remainingTypes };
          }
          return filter;
        })
        .filter((filter) => filter !== null);
    }

    if (!hasChanges) {
      this.logger.warn(`No matching subscriptions found for user ${userId}`);
      return {
        success: false,
        remainingCount: existingConfig.keywordFilters.length,
        removedItems: [],
        remainingFilters: existingConfig.keywordFilters,
      };
    }

    // 如果沒有剩餘的過濾器，完全移除訂閱
    if (updatedFilters.length === 0) {
      await this.databaseService.removeSubscriber(userId);
      this.logger.log(`Completely unsubscribed user: ${userId}`);
      return {
        success: true,
        remainingCount: 0,
        removedItems,
        remainingFilters: [],
      };
    }

    // 更新訂閱設定
    await this.databaseService.saveSubscriberWithFilters(
      userId,
      existingConfig.channelId,
      updatedFilters,
      false, // 不是合併，是替換
    );

    this.logger.log(
      `Partially unsubscribed user ${userId}. ${updatedFilters.length} filters remaining`,
    );
    return {
      success: true,
      remainingCount: updatedFilters.length,
      removedItems,
      remainingFilters: updatedFilters,
    };
  }

  async getSubscription(userId: string): Promise<SubscriberConfig | null> {
    return await this.databaseService.getSubscriber(userId);
  }

  async isSubscribed(userId: string): Promise<boolean> {
    const subscription = await this.databaseService.getSubscriber(userId);
    return !!subscription;
  }

  async getAllSubscriptions(): Promise<Map<string, SubscriberConfig>> {
    return await this.databaseService.getAllSubscribers();
  }

  private mergeKeywordFilters(
    existing: KeywordFilter[],
    newFilters: KeywordFilter[],
  ): KeywordFilter[] {
    // 建立一個 Map 來追蹤每個關鍵字的訊息類型
    const keywordMap = new Map<string, Set<string>>();

    // 加入現有的關鍵字過濾器
    existing.forEach((filter) => {
      const lowerKeyword = filter.keyword.toLowerCase();
      if (!keywordMap.has(lowerKeyword)) {
        keywordMap.set(lowerKeyword, new Set());
      }
      filter.messageTypes.forEach((type) =>
        keywordMap.get(lowerKeyword)!.add(type),
      );
    });

    // 合併新的關鍵字過濾器
    newFilters.forEach((filter) => {
      const lowerKeyword = filter.keyword.toLowerCase();
      if (!keywordMap.has(lowerKeyword)) {
        keywordMap.set(lowerKeyword, new Set());
      }
      filter.messageTypes.forEach((type) =>
        keywordMap.get(lowerKeyword)!.add(type),
      );
    });

    // 將 Map 轉換回 KeywordFilter 陣列，保持原始關鍵字大小寫
    const result: KeywordFilter[] = [];
    const processedKeywords = new Set<string>();

    // 先處理現有的關鍵字，保持原始大小寫
    existing.forEach((filter) => {
      const lowerKeyword = filter.keyword.toLowerCase();
      if (!processedKeywords.has(lowerKeyword)) {
        result.push({
          keyword: filter.keyword,
          messageTypes: Array.from(keywordMap.get(lowerKeyword)!),
        });
        processedKeywords.add(lowerKeyword);
      }
    });

    // 處理新加入的關鍵字
    newFilters.forEach((filter) => {
      const lowerKeyword = filter.keyword.toLowerCase();
      if (!processedKeywords.has(lowerKeyword)) {
        result.push({
          keyword: filter.keyword,
          messageTypes: Array.from(keywordMap.get(lowerKeyword)!),
        });
        processedKeywords.add(lowerKeyword);
      }
    });

    return result;
  }

  validateSubscriptionRequest(request: Partial<SubscriptionRequest>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!request.userId) {
      errors.push('userId is required');
    }

    if (!request.channelId) {
      errors.push('channelId is required');
    }

    if (!request.keywordFilters) {
      errors.push('keywordFilters array is required');
    } else if (request.keywordFilters.length === 0) {
      errors.push('at least one keyword filter is required');
    } else {
      const validTypes = ['buy', 'sell'];
      request.keywordFilters.forEach((filter, index) => {
        if (!filter.keyword || filter.keyword.trim() === '') {
          errors.push(`keyword is required for filter ${index + 1}`);
        }
        if (!filter.messageTypes || filter.messageTypes.length === 0) {
          errors.push(
            `at least one message type is required for filter ${index + 1}`,
          );
        } else {
          const invalidTypes = filter.messageTypes.filter(
            (type) => !validTypes.includes(type),
          );
          if (invalidTypes.length > 0) {
            errors.push(
              `invalid message types for filter ${index + 1}: ${invalidTypes.join(', ')}`,
            );
          }
        }
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
