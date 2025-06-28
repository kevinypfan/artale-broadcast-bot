/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriberService, SubscriptionRequest } from './subscriber.service';
import { DatabaseService } from '../database/database.service';
import { KeywordFilter } from '../schemas/subscriber.schema';

describe('SubscriberService', () => {
  let service: SubscriberService;
  let mockDatabaseService: jest.Mocked<DatabaseService>;

  beforeEach(async () => {
    const mockDatabase = {
      getSubscriber: jest.fn(),
      saveSubscriberWithFilters: jest.fn().mockResolvedValue(null),
      removeSubscriber: jest.fn(),
      getSubscribers: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriberService,
        {
          provide: DatabaseService,
          useValue: mockDatabase,
        },
      ],
    }).compile();

    service = module.get<SubscriberService>(SubscriberService);
    mockDatabaseService = module.get(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('subscribe', () => {
    it('should create new subscription when user is not subscribed', async () => {
      const keywordFilters: KeywordFilter[] = [
        { keyword: '劍', messageTypes: ['buy', 'sell'] },
        { keyword: '盾', messageTypes: ['buy', 'sell'] },
      ];

      const request: SubscriptionRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters,
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(null);

      const result = await service.subscribe(request);

      expect(
        mockDatabaseService.saveSubscriberWithFilters,
      ).toHaveBeenCalledWith('user1', 'channel1', keywordFilters, false);

      expect(result).toEqual({
        channelId: 'channel1',
        keywordFilters,
      });
    });

    it('should merge keyword filters when user already has subscription', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [
          { keyword: '劍', messageTypes: ['buy'] },
          { keyword: '斧', messageTypes: ['buy'] },
        ],
      };

      const newFilters: KeywordFilter[] = [
        { keyword: '盾', messageTypes: ['sell'] },
        { keyword: '劍', messageTypes: ['sell'] }, // Should merge with existing 劍
      ];

      const request: SubscriptionRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: newFilters,
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.subscribe(request);

      const expectedFilters = [
        { keyword: '劍', messageTypes: ['buy', 'sell'] }, // Merged
        { keyword: '斧', messageTypes: ['buy'] },
        { keyword: '盾', messageTypes: ['sell'] },
      ];

      expect(
        mockDatabaseService.saveSubscriberWithFilters,
      ).toHaveBeenCalledWith('user1', 'channel1', expectedFilters, true);

      expect(result).toEqual({
        channelId: 'channel1',
        keywordFilters: expectedFilters,
      });
    });

    it('should handle case-insensitive keyword deduplication', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      const newFilters: KeywordFilter[] = [
        { keyword: '劍', messageTypes: ['sell'] }, // Same keyword, different case handling
        { keyword: '盾', messageTypes: ['sell'] },
      ];

      const request: SubscriptionRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: newFilters,
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.subscribe(request);

      // 劍 should have both buy and sell types now
      expect(result.keywordFilters).toEqual([
        { keyword: '劍', messageTypes: ['buy', 'sell'] },
        { keyword: '盾', messageTypes: ['sell'] },
      ]);
    });

    it('should merge message types without duplicates for same keyword', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      const newFilters: KeywordFilter[] = [
        { keyword: '劍', messageTypes: ['buy', 'sell'] }, // 'buy' already exists
      ];

      const request: SubscriptionRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: newFilters,
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.subscribe(request);

      expect(result.keywordFilters).toEqual([
        { keyword: '劍', messageTypes: ['buy', 'sell'] },
      ]);
    });
  });

  describe('unsubscribe', () => {
    it('should unsubscribe existing user', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.unsubscribe('user1');

      expect(mockDatabaseService.removeSubscriber).toHaveBeenCalledWith(
        'user1',
      );
      expect(result).toBe(true);
    });

    it('should return false when user is not subscribed', async () => {
      mockDatabaseService.getSubscriber.mockResolvedValue(null);

      const result = await service.unsubscribe('user1');

      expect(mockDatabaseService.removeSubscriber).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('getSubscription', () => {
    it('should return subscription config when user exists', async () => {
      const config = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(config);

      const result = await service.getSubscription('user1');

      expect(result).toEqual(config);
    });

    it('should return null when user does not exist', async () => {
      mockDatabaseService.getSubscriber.mockResolvedValue(null);

      const result = await service.getSubscription('user1');

      expect(result).toBeNull();
    });
  });

  describe('isSubscribed', () => {
    it('should return true when user is subscribed', async () => {
      const config = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(config);

      const result = await service.isSubscribed('user1');

      expect(result).toBe(true);
    });

    it('should return false when user is not subscribed', async () => {
      mockDatabaseService.getSubscriber.mockResolvedValue(null);

      const result = await service.isSubscribed('user1');

      expect(result).toBe(false);
    });
  });

  describe('partialUnsubscribe', () => {
    it('should remove specific keywords completely when no message types specified', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [
          { keyword: '劍', messageTypes: ['buy', 'sell'] },
          { keyword: '盾', messageTypes: ['buy'] },
          { keyword: '斧', messageTypes: ['sell'] },
        ],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);
      mockDatabaseService.saveSubscriberWithFilters.mockResolvedValue(
        undefined,
      );

      const result = await service.partialUnsubscribe(
        'user1',
        ['盾'],
        [], // 沒有指定訊息類型，應該完全移除關鍵字
      );

      expect(result.success).toBe(true);
      expect(result.remainingCount).toBe(2);

      expect(
        mockDatabaseService.saveSubscriberWithFilters,
      ).toHaveBeenCalledWith(
        'user1',
        'channel1',
        [
          { keyword: '劍', messageTypes: ['buy', 'sell'] },
          { keyword: '斧', messageTypes: ['sell'] },
        ],
        false,
      );
    });

    it('should remove specific message types from keywords', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [
          { keyword: '劍', messageTypes: ['buy', 'sell'] },
          { keyword: '盾', messageTypes: ['buy', 'sell'] },
        ],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);
      mockDatabaseService.saveSubscriberWithFilters.mockResolvedValue(
        undefined,
      );

      const result = await service.partialUnsubscribe('user1', ['劍'], ['buy']);

      expect(result.success).toBe(true);
      expect(result.remainingCount).toBe(2);

      expect(
        mockDatabaseService.saveSubscriberWithFilters,
      ).toHaveBeenCalledWith(
        'user1',
        'channel1',
        [
          { keyword: '劍', messageTypes: ['sell'] },
          { keyword: '盾', messageTypes: ['buy', 'sell'] },
        ],
        false,
      );
    });

    it('should remove message types from all keywords when no keywords specified', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [
          { keyword: '劍', messageTypes: ['buy', 'sell'] },
          { keyword: '盾', messageTypes: ['buy', 'sell'] },
        ],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);
      mockDatabaseService.saveSubscriberWithFilters.mockResolvedValue(
        undefined,
      );

      const result = await service.partialUnsubscribe('user1', [], ['buy']);

      expect(result.success).toBe(true);
      expect(result.remainingCount).toBe(2);

      expect(
        mockDatabaseService.saveSubscriberWithFilters,
      ).toHaveBeenCalledWith(
        'user1',
        'channel1',
        [
          { keyword: '劍', messageTypes: ['sell'] },
          { keyword: '盾', messageTypes: ['sell'] },
        ],
        false,
      );
    });

    it('should completely unsubscribe when all filters are removed', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);
      mockDatabaseService.removeSubscriber.mockResolvedValue();

      const result = await service.partialUnsubscribe('user1', ['劍'], ['buy']);

      expect(result.success).toBe(true);
      expect(result.remainingCount).toBe(0);
      expect(mockDatabaseService.removeSubscriber).toHaveBeenCalledWith(
        'user1',
      );
      expect(
        mockDatabaseService.saveSubscriberWithFilters,
      ).not.toHaveBeenCalled();
    });

    it('should return false when user is not subscribed', async () => {
      mockDatabaseService.getSubscriber.mockResolvedValue(null);

      const result = await service.partialUnsubscribe('user1', ['劍'], ['buy']);

      expect(result.success).toBe(false);
      expect(result.remainingCount).toBe(0);
    });

    it('should return false when no matching subscriptions found', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['sell'] }],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.partialUnsubscribe('user1', ['盾'], ['buy']);

      expect(result.success).toBe(false);
      expect(result.remainingCount).toBe(1);
    });

    it('should return false when no keywords and no message types specified', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['sell'] }],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.partialUnsubscribe('user1', [], []);

      expect(result.success).toBe(false);
      expect(result.remainingCount).toBe(1);
    });
  });

  describe('validateSubscriptionRequest', () => {
    it('should validate correct subscription request', () => {
      const request: SubscriptionRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy', 'sell'] }],
      };

      const result = service.validateSubscriptionRequest(request);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for missing required fields', () => {
      const request = {
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      const result = service.validateSubscriptionRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        'userId is required',
        'channelId is required',
      ]);
    });

    it('should return error for invalid message types', () => {
      const request = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['invalid', 'buy'] }],
      };

      const result = service.validateSubscriptionRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        'invalid message types for filter 1: invalid',
      ]);
    });

    it('should return error when no message types provided', () => {
      const request = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: [] }],
      };

      const result = service.validateSubscriptionRequest(request);

      expect(result.isValid).toBe(false);
      expect(result.errors).toEqual([
        'at least one message type is required for filter 1',
      ]);
    });
  });

  describe('keyword merging edge cases', () => {
    it('should handle empty keyword filter arrays', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [],
      };

      const request: SubscriptionRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['sell'] }],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.subscribe(request);

      expect(result.keywordFilters).toEqual([
        { keyword: '劍', messageTypes: ['sell'] },
      ]);
    });

    it('should handle adding empty keyword filters to existing subscription', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      const request: SubscriptionRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywordFilters: [],
      };

      mockDatabaseService.getSubscriber.mockResolvedValue(existingConfig);

      const result = await service.subscribe(request);

      expect(result.keywordFilters).toEqual([
        { keyword: '劍', messageTypes: ['buy'] },
      ]);
    });
  });
});
