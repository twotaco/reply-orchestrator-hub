import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ActivityLogsPage from './ActivityLogsPage';

// Mock dependencies
vi.mock('@/integrations/supabase/activityLogs', () => ({
  fetchEmailInteractions: vi.fn(),
  fetchEmailInteractionDetails: vi.fn(),
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: vi.fn(() => ({
    toast: vi.fn(),
  })),
}));

// Mock lucide-react icons
vi.mock('lucide-react', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    CalendarIcon: () => <div data-testid="calendar-icon" />,
    ChevronDown: () => <div data-testid="chevron-down-icon" />,
    ChevronRight: () => <div data-testid="chevron-right-icon" />,
    RefreshCwIcon: () => <div data-testid="refresh-cw-icon" />,
    EyeIcon: () => <div data-testid="eye-icon" />,
    CodeIcon: () => <div data-testid="code-icon" />,
  };
});


// Import mocked functions to spy on them or set mock implementations
import { fetchEmailInteractions, fetchEmailInteractionDetails } from '@/integrations/supabase/activityLogs';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/ui/use-toast';


const mockSupabaseClient = {
  functions: {
    invoke: vi.fn(),
  },
  // Add any other client methods used by the component if necessary
};

const mockUser = {
  id: 'user-123',
  // supabaseClient: mockSupabaseClient // This was the previous approach
  // other user properties
};


describe('ActivityLogsPage', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Setup default mock implementations
    (useAuth as vi.Mock).mockReturnValue({ user: mockUser, supabaseClient: mockSupabaseClient });
    (fetchEmailInteractions as vi.Mock).mockResolvedValue({ data: [], count: 0 });
    (fetchEmailInteractionDetails as vi.Mock).mockResolvedValue(null);
    (mockSupabaseClient.functions.invoke as vi.Mock).mockResolvedValue({ data: {}, error: null });
    // (useToast().toast as vi.Mock).mockClear(); // toast is a new mock fn for each useToast() call, so clear the factory's one
  });

  it('should render loading state initially and then display logs', async () => {
    const mockLogs = [
      { id: '1', created_at: new Date().toISOString(), from_email: 'test1@example.com', subject: 'Subject 1', status: 'processed' },
      { id: '2', created_at: new Date().toISOString(), from_email: 'test2@example.com', subject: 'Subject 2', status: 'failed' },
    ];
    (fetchEmailInteractions as vi.Mock).mockResolvedValueOnce({ data: mockLogs, count: mockLogs.length });

    render(<ActivityLogsPage />);

    expect(screen.getByText('Loading logs...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText('Loading logs...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Subject 1')).toBeInTheDocument();
    expect(screen.getByText('test2@example.com')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1')).toBeInTheDocument();
  });

  it('should display "No activity logs found" when no logs are returned', async () => {
    (fetchEmailInteractions as vi.Mock).mockResolvedValueOnce({ data: [], count: 0 });
    render(<ActivityLogsPage />);

    await waitFor(() => {
      expect(screen.getByText('No activity logs found.')).toBeInTheDocument();
    });
  });

  it('should handle error state if fetchEmailInteractions fails', async () => {
    const errorMessage = "Failed to fetch logs";
    (fetchEmailInteractions as vi.Mock).mockRejectedValueOnce(new Error(errorMessage));
    render(<ActivityLogsPage />);

    await waitFor(() => {
      expect(screen.getByText(`Error: ${errorMessage}`)).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should call fetchEmailInteractions with correct date range for "Today" filter', async () => {
      render(<ActivityLogsPage />);
      await userEvent.click(screen.getByRole('button', { name: 'Today' }));

      await waitFor(() => {
        expect(fetchEmailInteractions).toHaveBeenCalledWith(
          expect.anything(), // supabaseClient
          expect.objectContaining({
            page: 1,
            startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00/), // Start of today
            endDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T23:59:59/),   // End of today
          })
        );
      });
    });

    it('should call fetchEmailInteractions with correct date range for "7 Days" filter', async () => {
        render(<ActivityLogsPage />);
        // Default is 7 days, so it should be called on initial render
        await waitFor(() => {
            expect(fetchEmailInteractions).toHaveBeenCalledWith(
              expect.anything(),
              expect.objectContaining({
                page: 1,
                // startDate should be 6 days ago (inclusive of today makes 7 days)
                // endDate should be end of today
              })
            );
          });

        // Click it again to ensure behavior
        (fetchEmailInteractions as vi.Mock).mockClear(); // Clear previous calls
        await userEvent.click(screen.getByRole('button', { name: '7 Days' }));

        await waitFor(() => {
          expect(fetchEmailInteractions).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
              page: 1,
              // Add specific date checks if needed, similar to "Today" but for 7 days
            })
          );
        });
      });

    // TODO: Test "30 Days" filter
    // TODO: Test custom date range filter:
    //    - Open popover
    //    - Select start and end dates (mock Calendar onSelect)
    //    - Click "Apply Custom Range"
    //    - Verify fetchEmailInteractions call with custom dates
  });

  describe('Pagination', () => {
    it('should call fetchEmailInteractions with correct page for "Next" button', async () => {
      (fetchEmailInteractions as vi.Mock).mockResolvedValue({ data: new Array(10).fill({}).map((_,i)=>({id: `${i}`, created_at: new Date().toISOString(), from_email: `test${i}@example.com`, subject: `S${i}`, status: 'ok'})), count: 20 }); // 2 pages
      render(<ActivityLogsPage />);

      await waitFor(() => expect(screen.getByText('Page 1 of 2')).toBeInTheDocument());

      (fetchEmailInteractions as vi.Mock).mockClear();
      await userEvent.click(screen.getByRole('button', { name: 'Next' }));

      await waitFor(() => {
        expect(fetchEmailInteractions).toHaveBeenCalledWith(
          expect.anything(),
          expect.objectContaining({ page: 2 })
        );
      });
      await waitFor(() => expect(screen.getByText('Page 2 of 2')).toBeInTheDocument());
    });
    // TODO: Test "Previous" button
    // TODO: Test button disabled states
  });

  describe('Row Expansion and Details', () => {
    const mockLogDetail = {
        id: '1', created_at: new Date().toISOString(), from_email: 'detail@example.com', subject: 'Detail Subject', status: 'processed',
        postmark_request: { From: 'sender@example.com', To: 'receiver@example.com', Subject: 'Raw Subject', TextBody: 'Email text body' },
        mcp_plan: [{ tool: 'tool1', args: { param: 'value' } }],
        mcp_results: [{ status: 'success', response: 'Tool 1 success' }],
        knowreply_response: { reply_email_data: { to: 'final@example.com', subject: 'Final Subject', text_body: 'Final email body' } }
    };

    beforeEach(() => {
        const mockLogs = [{ id: '1', created_at: new Date().toISOString(), from_email: 'test1@example.com', subject: 'Subject 1', status: 'processed' }];
        (fetchEmailInteractions as vi.Mock).mockResolvedValue({ data: mockLogs, count: 1 });
        (fetchEmailInteractionDetails as vi.Mock).mockResolvedValue(mockLogDetail);
    });

    it('should call fetchEmailInteractionDetails on row click and display card titles', async () => {
      render(<ActivityLogsPage />);
      await waitFor(() => expect(screen.getByText('Subject 1')).toBeInTheDocument());

      await userEvent.click(screen.getByText('Subject 1'));

      await waitFor(() => {
        expect(fetchEmailInteractionDetails).toHaveBeenCalledWith(
          expect.anything(), // supabaseClient
          expect.objectContaining({ userId: mockUser.id, interactionId: '1' })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Incoming Email')).toBeInTheDocument();
        expect(screen.getByText('Webhook Call Plan & Results')).toBeInTheDocument();
        expect(screen.getByText('Generated Email Response')).toBeInTheDocument();
      });
    });

    // TODO: Test row collapse
    // TODO: Test JSON view toggle for each card
    //    - Click "View JSON"
    //    - Verify JSON content is shown (e.g., by checking for specific keys/values in a <pre> tag)
    //    - Click "View Formatted"
    //    - Verify formatted content is shown
    // TODO: Test re-run button click
    //    - Verify supabaseClient.functions.invoke is called with 'rerun-email-interaction' and correct interactionId
    //    - Verify toast is called on success/failure
  });

  // TODO: Add more specific tests for error handling in detail view, re-run, etc.
});
