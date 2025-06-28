import { Module } from '@nestjs/common';
import { WebSocketService } from './websocket.service';
import { DatabaseModule } from '../database/database.module';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [DatabaseModule, DiscordModule],
  providers: [WebSocketService],
  exports: [WebSocketService],
})
export class WebSocketModule {}
