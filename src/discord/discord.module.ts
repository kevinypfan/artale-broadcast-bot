import { Module } from '@nestjs/common';
import { DiscordService } from './discord.service';
import { CommandService } from './command.service';
import { SubscriberModule } from '../subscriber/subscriber.module';

@Module({
  imports: [SubscriberModule],
  providers: [DiscordService, CommandService],
  exports: [DiscordService],
})
export class DiscordModule {}
