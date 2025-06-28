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
  private subscribers = new Map<string, SubscriberConfig>();

  constructor(
    @InjectModel(Subscriber.name)
    private subscriberModel: Model<SubscriberDocument>,
  ) {
    void this.loadSubscribers();
  }

  async loadSubscribers(): Promise<void> {
    try {
      const subscribers = await this.subscriberModel.find().exec();
      subscribers.forEach((subscriber) => {
        this.subscribers.set(subscriber.userId, {
          channelId: subscriber.channelId,
          keywordFilters: subscriber.keywordFilters || [],
        });
      });
      this.logger.log(`Loaded ${subscribers.length} subscribers from database`);
    } catch (error) {
      this.logger.error('Error loading subscribers:', error);
    }
  }

  async removeSubscriber(userId: string): Promise<void> {
    try {
      await this.subscriberModel.deleteOne({ userId }).exec();
      this.subscribers.delete(userId);
    } catch (error) {
      this.logger.error('Error removing subscriber:', error);
    }
  }

  async resetSubscriber(userId: string): Promise<void> {
    try {
      await this.subscriberModel.deleteOne({ userId }).exec();
      this.subscribers.delete(userId);
    } catch (error) {
      this.logger.error('Error resetting subscriber:', error);
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

      this.subscribers.set(userId, {
        channelId,
        keywordFilters: finalKeywordFilters,
      });
    } catch (error) {
      this.logger.error('Error saving subscriber with filters:', error);
    }
  }

  getSubscriber(userId: string): SubscriberConfig | undefined {
    return this.subscribers.get(userId);
  }

  getSubscribers(): Map<string, SubscriberConfig> {
    return this.subscribers;
  }

  async getSubscriberFromDb(userId: string): Promise<Subscriber | null> {
    try {
      return await this.subscriberModel.findOne({ userId }).exec();
    } catch (error) {
      this.logger.error('Error getting subscriber from database:', error);
      return null;
    }
  }
}
