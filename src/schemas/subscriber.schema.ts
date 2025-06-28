import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export interface KeywordFilter {
  keyword: string;
  messageTypes: string[];
}

export type SubscriberDocument = Subscriber & Document;

@Schema()
export class Subscriber {
  @Prop({ required: true, unique: true })
  userId: string;

  @Prop({ required: true })
  channelId: string;

  // 關鍵字過濾結構
  @Prop({
    type: [
      {
        keyword: { type: String, required: true },
        messageTypes: { type: [String], required: true },
      },
    ],
    default: [],
  })
  keywordFilters: KeywordFilter[];

  @Prop({ default: Date.now })
  createdAt: Date;

  @Prop({ default: Date.now })
  updatedAt: Date;
}

export const SubscriberSchema = SchemaFactory.createForClass(Subscriber);
