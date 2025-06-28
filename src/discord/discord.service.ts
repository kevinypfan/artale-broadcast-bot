import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { Client, GatewayIntentBits, REST, Routes } from 'discord.js';
import { CommandService } from './command.service';

@Injectable()
export class DiscordService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DiscordService.name);
  private client: Client;

  constructor(private readonly commandService: CommandService) {
    this.client = new Client({
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    });
  }

  async onModuleInit() {
    await this.initializeBot();
  }

  onModuleDestroy() {
    if (this.client) {
      void this.client.destroy();
    }
  }

  getClient(): Client {
    return this.client;
  }

  private async initializeBot() {
    try {
      if (!process.env.DISCORD_TOKEN) {
        throw new Error('DISCORD_TOKEN environment variable is required');
      }

      this.client.once('ready', () => {
        this.logger.log(`Logged in as ${this.client.user?.tag || 'Unknown'}!`);
        void this.registerCommands();
      });

      this.client.on('interactionCreate', (interaction) => {
        if (interaction.isChatInputCommand()) {
          void this.commandService.handleCommands(interaction);
        }
      });

      await this.client.login(process.env.DISCORD_TOKEN);
    } catch (error) {
      this.logger.error('Failed to initialize Discord bot:', error);
      throw error;
    }
  }

  private async registerCommands() {
    try {
      if (!process.env.DISCORD_TOKEN || !process.env.CLIENT_ID) {
        throw new Error(
          'DISCORD_TOKEN and CLIENT_ID environment variables are required',
        );
      }

      const rest = new REST({ version: '10' }).setToken(
        process.env.DISCORD_TOKEN,
      );
      const commands = this.commandService.createCommands();

      this.logger.log('Started refreshing application (/) commands');
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
        body: commands,
      });
      this.logger.log('Successfully reloaded application (/) commands');
    } catch (error) {
      this.logger.error('Error registering commands:', error);
    }
  }
}
