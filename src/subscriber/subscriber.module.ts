import { Module } from '@nestjs/common';
import { SubscriberService } from './subscriber.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [SubscriberService],
  exports: [SubscriberService],
})
export class SubscriberModule {}
