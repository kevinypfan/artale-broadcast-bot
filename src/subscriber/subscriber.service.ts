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
    const existingConfig = this.databaseService.getSubscriber(userId);
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
    const existingConfig = this.databaseService.getSubscriber(userId);

    if (!existingConfig) {
      this.logger.warn(`Attempted to unsubscribe non-existent user: ${userId}`);
      return false;
    }

    await this.databaseService.removeSubscriber(userId);
    this.logger.log(`Unsubscribed user: ${userId}`);
    return true;
  }

  async reset(userId: string): Promise<boolean> {
    const existingConfig = this.databaseService.getSubscriber(userId);

    if (!existingConfig) {
      this.logger.warn(`Attempted to reset non-existent user: ${userId}`);
      return false;
    }

    await this.databaseService.resetSubscriber(userId);
    this.logger.log(`Reset subscription for user: ${userId}`);
    return true;
  }

  getSubscription(userId: string): SubscriberConfig | null {
    return this.databaseService.getSubscriber(userId) || null;
  }

  isSubscribed(userId: string): boolean {
    return !!this.databaseService.getSubscriber(userId);
  }

  getAllSubscriptions(): Map<string, SubscriberConfig> {
    return this.databaseService.getSubscribers();
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
