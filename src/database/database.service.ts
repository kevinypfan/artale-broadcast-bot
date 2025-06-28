import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  Subscriber,
  SubscriberDocument,
  KeywordFilter,
} from '../schemas/subscriber.schema';

export interface SubscriberConfig {
  channelId: string;
  keywordFilters: KeywordFilter[];
}

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectModel(Subscriber.name)
    private subscriberModel: Model<SubscriberDocument>,
  ) {}

  async removeSubscriber(userId: string): Promise<void> {
    try {
      await this.subscriberModel.deleteOne({ userId }).exec();
    } catch (error) {
      this.logger.error('Error removing subscriber:', error);
    }
  }

  async saveSubscriberWithFilters(
    userId: string,
    channelId: string,
    keywordFilters: KeywordFilter[],
    merge: boolean = false,
  ): Promise<void> {
    try {
      let finalKeywordFilters = keywordFilters;

      if (merge) {
        const existing = await this.subscriberModel.findOne({ userId }).exec();
        if (existing) {
          // 這裡的合併邏輯由 SubscriberService 處理
          finalKeywordFilters = keywordFilters;
        }
      }

      await this.subscriberModel.findOneAndUpdate(
        { userId },
        {
          channelId,
          keywordFilters: finalKeywordFilters,
          updatedAt: new Date(),
        },
        { upsert: true, new: true },
      );
    } catch (error) {
      this.logger.error('Error saving subscriber with filters:', error);
    }
  }

  async getSubscriber(userId: string): Promise<SubscriberConfig | null> {
    try {
      const subscriber = await this.subscriberModel.findOne({ userId }).exec();
      if (!subscriber) return null;

      return {
        channelId: subscriber.channelId,
        keywordFilters: subscriber.keywordFilters || [],
      };
    } catch (error) {
      this.logger.error('Error getting subscriber:', error);
      return null;
    }
  }

  async getAllSubscribers(): Promise<Map<string, SubscriberConfig>> {
    try {
      const subscribers = await this.subscriberModel.find().exec();
      const subscribersMap = new Map<string, SubscriberConfig>();

      subscribers.forEach((subscriber) => {
        subscribersMap.set(subscriber.userId, {
          channelId: subscriber.channelId,
          keywordFilters: subscriber.keywordFilters || [],
        });
      });

      return subscribersMap;
    } catch (error) {
      this.logger.error('Error getting all subscribers:', error);
      return new Map();
    }
  }
}
