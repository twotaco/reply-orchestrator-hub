import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchEmailInteractions, fetchEmailInteractionDetails } from './activityLogs';
import { SupabaseClient } from '@supabase/supabase-js';

// Mock Supabase client
const mockSupabaseClient = {
  from: vi.fn().mockReturnThis(),
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  gte: vi.fn().mockReturnThis(),
  lte: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  range: vi.fn().mockReturnThis(),
  single: vi.fn().mockReturnThis(),
} as unknown as SupabaseClient;


describe('activityLogs Supabase integration functions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchEmailInteractions', () => {
    const defaultParams = {
      userId: 'user-123',
      page: 1,
      pageSize: 10,
    };

    it('should call Supabase client with correct base parameters', async () => {
      (mockSupabaseClient.select as vi.Mock).mockResolvedValueOnce({ data: [], count: 0, error: null });

      await fetchEmailInteractions(mockSupabaseClient, defaultParams);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('email_interactions');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith('id, created_at, from_email, subject, status', { count: 'exact' });
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', defaultParams.userId);
      expect(mockSupabaseClient.order).toHaveBeenCalledWith('created_at', { ascending: false });
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(0, 9); // page 1, pageSize 10
    });

    it('should include date filters if startDate and endDate are provided', async () => {
      const paramsWithDates = {
        ...defaultParams,
        startDate: '2023-01-01T00:00:00.000Z',
        endDate: '2023-01-31T23:59:59.999Z',
      };
      (mockSupabaseClient.select as vi.Mock).mockResolvedValueOnce({ data: [], count: 0, error: null });

      await fetchEmailInteractions(mockSupabaseClient, paramsWithDates);

      expect(mockSupabaseClient.gte).toHaveBeenCalledWith('created_at', paramsWithDates.startDate);
      expect(mockSupabaseClient.lte).toHaveBeenCalledWith('created_at', paramsWithDates.endDate);
    });

    it('should only include startDate filter if only startDate is provided', async () => {
        const paramsWithStartDate = {
          ...defaultParams,
          startDate: '2023-01-01T00:00:00.000Z',
        };
        (mockSupabaseClient.select as vi.Mock).mockResolvedValueOnce({ data: [], count: 0, error: null });

        await fetchEmailInteractions(mockSupabaseClient, paramsWithStartDate);

        expect(mockSupabaseClient.gte).toHaveBeenCalledWith('created_at', paramsWithStartDate.startDate);
        expect(mockSupabaseClient.lte).not.toHaveBeenCalled();
      });


    it('should calculate pagination range correctly for page 2', async () => {
      const paramsPage2 = { ...defaultParams, page: 2 };
      (mockSupabaseClient.select as vi.Mock).mockResolvedValueOnce({ data: [], count: 0, error: null });

      await fetchEmailInteractions(mockSupabaseClient, paramsPage2);
      expect(mockSupabaseClient.range).toHaveBeenCalledWith(10, 19); // page 2, pageSize 10
    });

    it('should return data and count on successful fetch', async () => {
      const mockData = [{ id: '1', subject: 'Test' }];
      const mockCount = 1;
      (mockSupabaseClient.select as vi.Mock).mockResolvedValueOnce({ data: mockData, count: mockCount, error: null });

      const result = await fetchEmailInteractions(mockSupabaseClient, defaultParams);

      expect(result.data).toEqual(mockData);
      expect(result.count).toEqual(mockCount);
    });

    it('should throw error if Supabase query errors', async () => {
      const dbError = new Error('DB Read Error');
      (mockSupabaseClient.select as vi.Mock).mockResolvedValueOnce({ data: null, count: null, error: dbError });

      await expect(fetchEmailInteractions(mockSupabaseClient, defaultParams))
        .rejects.toThrow('DB Read Error');
    });

    it('should return empty data and count 0 if an unexpected error occurs and is caught', async () => {
        // Simulate an error not from Supabase directly, but within the try-catch
        (mockSupabaseClient.select as vi.Mock).mockImplementationOnce(() => {
            throw new Error("Unexpected processing error");
        });

        // The function is designed to catch and log, then return empty state
        const result = await fetchEmailInteractions(mockSupabaseClient, defaultParams);
        expect(result.data).toEqual([]);
        expect(result.count).toEqual(0);
      });
  });

  describe('fetchEmailInteractionDetails', () => {
    const defaultDetailParams = {
      userId: 'user-xyz',
      interactionId: 'interaction-abc',
    };

    it('should call Supabase client with correct parameters for details', async () => {
      (mockSupabaseClient.single as vi.Mock).mockResolvedValueOnce({ data: { id: 'interaction-abc' }, error: null });

      await fetchEmailInteractionDetails(mockSupabaseClient, defaultDetailParams);

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('email_interactions');
      expect(mockSupabaseClient.select).toHaveBeenCalledWith(
        'id, created_at, from_email, subject, status, postmark_request, mcp_plan, mcp_results, knowreply_response'
      );
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('user_id', defaultDetailParams.userId);
      expect(mockSupabaseClient.eq).toHaveBeenCalledWith('id', defaultDetailParams.interactionId);
      expect(mockSupabaseClient.single).toHaveBeenCalled();
    });

    it('should return data on successful fetch', async () => {
      const mockDetailData = { id: 'interaction-abc', subject: 'Detailed Test' };
      (mockSupabaseClient.single as vi.Mock).mockResolvedValueOnce({ data: mockDetailData, error: null });

      const result = await fetchEmailInteractionDetails(mockSupabaseClient, defaultDetailParams);
      expect(result).toEqual(mockDetailData);
    });

    it('should return null if record not found (PGRST116 error)', async () => {
      const notFoundError = { code: 'PGRST116', message: 'Row not found' };
      (mockSupabaseClient.single as vi.Mock).mockResolvedValueOnce({ data: null, error: notFoundError });

      const result = await fetchEmailInteractionDetails(mockSupabaseClient, defaultDetailParams);
      expect(result).toBeNull();
    });

    it('should throw error if Supabase query errors (non-PGRST116)', async () => {
      const dbError = new Error('DB Detail Read Error');
      (mockSupabaseClient.single as vi.Mock).mockResolvedValueOnce({ data: null, error: dbError });

      await expect(fetchEmailInteractionDetails(mockSupabaseClient, defaultDetailParams))
        .rejects.toThrow('DB Detail Read Error');
    });

    it('should return null if an unexpected error occurs and is caught', async () => {
        (mockSupabaseClient.single as vi.Mock).mockImplementationOnce(() => {
            throw new Error("Unexpected detail processing error");
        });

        const result = await fetchEmailInteractionDetails(mockSupabaseClient, defaultDetailParams);
        expect(result).toBeNull();
    });
  });
});
