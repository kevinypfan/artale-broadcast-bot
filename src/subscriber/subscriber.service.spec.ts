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
      saveSubscriber: jest.fn(),
      saveSubscriberWithFilters: jest.fn().mockResolvedValue(undefined),
      removeSubscriber: jest.fn(),
      resetSubscriber: jest.fn(),
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

      mockDatabaseService.getSubscriber.mockReturnValue(undefined);

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

      mockDatabaseService.getSubscriber.mockReturnValue(existingConfig);

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

      mockDatabaseService.getSubscriber.mockReturnValue(existingConfig);

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

      mockDatabaseService.getSubscriber.mockReturnValue(existingConfig);

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

      mockDatabaseService.getSubscriber.mockReturnValue(existingConfig);

      const result = await service.unsubscribe('user1');

      expect(mockDatabaseService.removeSubscriber).toHaveBeenCalledWith(
        'user1',
      );
      expect(result).toBe(true);
    });

    it('should return false when user is not subscribed', async () => {
      mockDatabaseService.getSubscriber.mockReturnValue(undefined);

      const result = await service.unsubscribe('user1');

      expect(mockDatabaseService.removeSubscriber).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset existing user subscription', async () => {
      const existingConfig = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      mockDatabaseService.getSubscriber.mockReturnValue(existingConfig);

      const result = await service.reset('user1');

      expect(mockDatabaseService.resetSubscriber).toHaveBeenCalledWith('user1');
      expect(result).toBe(true);
    });

    it('should return false when user is not subscribed', async () => {
      mockDatabaseService.getSubscriber.mockReturnValue(undefined);

      const result = await service.reset('user1');

      expect(mockDatabaseService.resetSubscriber).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });

  describe('getSubscription', () => {
    it('should return subscription config when user exists', () => {
      const config = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      mockDatabaseService.getSubscriber.mockReturnValue(config);

      const result = service.getSubscription('user1');

      expect(result).toEqual(config);
    });

    it('should return null when user does not exist', () => {
      mockDatabaseService.getSubscriber.mockReturnValue(undefined);

      const result = service.getSubscription('user1');

      expect(result).toBeNull();
    });
  });

  describe('isSubscribed', () => {
    it('should return true when user is subscribed', () => {
      const config = {
        channelId: 'channel1',
        keywordFilters: [{ keyword: '劍', messageTypes: ['buy'] }],
      };

      mockDatabaseService.getSubscriber.mockReturnValue(config);

      const result = service.isSubscribed('user1');

      expect(result).toBe(true);
    });

    it('should return false when user is not subscribed', () => {
      mockDatabaseService.getSubscriber.mockReturnValue(undefined);

      const result = service.isSubscribed('user1');

      expect(result).toBe(false);
    });
  });

  describe('subscribeLegacy', () => {
    it('should convert legacy format to new format', async () => {
      const legacyRequest = {
        userId: 'user1',
        channelId: 'channel1',
        keywords: ['劍', '盾'],
        messageTypes: ['buy', 'sell'],
      };

      mockDatabaseService.getSubscriber.mockReturnValue(undefined);

      await service.subscribeLegacy(legacyRequest);

      expect(
        mockDatabaseService.saveSubscriberWithFilters,
      ).toHaveBeenCalledWith(
        'user1',
        'channel1',
        [
          { keyword: '劍', messageTypes: ['buy', 'sell'] },
          { keyword: '盾', messageTypes: ['buy', 'sell'] },
        ],
        false,
      );
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

      mockDatabaseService.getSubscriber.mockReturnValue(existingConfig);

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

      mockDatabaseService.getSubscriber.mockReturnValue(existingConfig);

      const result = await service.subscribe(request);

      expect(result.keywordFilters).toEqual([
        { keyword: '劍', messageTypes: ['buy'] },
      ]);
    });
  });
});
