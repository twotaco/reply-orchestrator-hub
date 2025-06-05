import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { fetchEmailInteractions } from '../integrations/supabase/activityLogs';
import { Button } from '../components/ui/button';
import { Calendar } from '../components/ui/calendar';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/card'; // Import Card components
import { CalendarIcon, ChevronDown, ChevronRight, RefreshCwIcon, EyeIcon, CodeIcon } from 'lucide-react'; // Assuming lucide-react is used for icons
import { format } from 'date-fns'; // For date formatting
import { useToast } from '../components/ui/use-toast'; // Import useToast

interface EmailInteractionBase {
  id: string;
  created_at: string;
  from_email: string;
  subject: string;
  status: string;
}

// Interface for the full details, including JSON fields
interface EmailInteractionDetails extends EmailInteractionBase {
  postmark_request?: any;
  mcp_plan?: any[];
  mcp_results?: any[];
  knowreply_response?: any;
}

const PAGE_SIZE = 10;

const ActivityLogsPage: React.FC = () => {
  const { user, supabaseClient } = useAuth(); // Destructure supabaseClient from useAuth
  const [logs, setLogs] = useState<EmailInteractionBase[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalLogs, setTotalLogs] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedFilter, setSelectedFilter] = useState<string>('7days'); // Default to 7 days
  const [customStartDate, setCustomStartDate] = useState<Date | undefined>(undefined);
  const [customEndDate, setCustomEndDate] = useState<Date | undefined>(undefined);

  // State for expanded row and its details
  const [expandedLogRowId, setExpandedLogRowId] = useState<string | null>(null);
  const [detailedLog, setDetailedLog] = useState<EmailInteractionDetails | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false); // State for re-run button loading

  // State for JSON view toggles per card
  const [showJson, setShowJson] = useState({
    card1: false, // Incoming Email
    card2: false, // Webhook Call Plan & Results
    card3: false, // Generated Email Response
  });

  const { toast } = useToast();
  const totalPages = Math.ceil(totalLogs / PAGE_SIZE);

  const calculateDateRange = useCallback(() => {
    const today = new Date();
    let startDate: Date | undefined = undefined;
    let endDate: Date | undefined = new Date(today.setHours(23, 59, 59, 999)); // End of today

    if (selectedFilter === 'today') {
      startDate = new Date(today.setHours(0, 0, 0, 0));
    } else if (selectedFilter === '7days') {
      startDate = new Date(new Date().setDate(today.getDate() - 6));
      startDate.setHours(0, 0, 0, 0);
    } else if (selectedFilter === '30days') {
      startDate = new Date(new Date().setDate(today.getDate() - 29));
      startDate.setHours(0, 0, 0, 0);
    } else if (selectedFilter === 'custom' && customStartDate && customEndDate) {
      startDate = new Date(customStartDate.setHours(0,0,0,0));
      endDate = new Date(customEndDate.setHours(23,59,59,999));
    } else if (selectedFilter === 'custom' && customStartDate) {
        startDate = new Date(customStartDate.setHours(0,0,0,0));
        endDate = undefined; // Or set to a far future date if API requires an end date
    }
    return { startDate, endDate };
  }, [selectedFilter, customStartDate, customEndDate]);


  useEffect(() => {
    if (!user?.id || !supabaseClient) { // Check for supabaseClient as well
      setError("User not authenticated or Supabase client not available.");
      setLogs([]);
      setTotalLogs(0);
      return;
    }

    const loadLogs = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const { startDate, endDate } = calculateDateRange();
        const { data, count } = await fetchEmailInteractions(supabaseClient, { // Pass supabaseClient directly
          userId: user.id,
          page: currentPage,
          pageSize: PAGE_SIZE,
          startDate: startDate?.toISOString(),
          endDate: endDate?.toISOString(),
        });
        setLogs(data || []);
        setTotalLogs(count || 0);
      } catch (err) {
        console.error('Failed to fetch activity logs:', err);
        setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        setLogs([]);
        setTotalLogs(0);
      } finally {
        setIsLoading(false);
      }
    };

    loadLogs();
  }, [user, supabaseClient, currentPage, selectedFilter, customStartDate, customEndDate, calculateDateRange]);


  // Effect to fetch details when a row is expanded
  useEffect(() => {
    if (expandedLogRowId && user?.id && supabaseClient) {
      const fetchDetails = async () => {
        setIsDetailLoading(true);
        setDetailedLog(null); // Clear previous details
        try {
          // @ts-ignore
          const details = await fetchEmailInteractionDetails(supabaseClient, { // Pass supabaseClient
            userId: user.id,
            interactionId: expandedLogRowId,
          });
          setDetailedLog(details);
          if (!details) {
            setError(`Could not load details for log ID: ${expandedLogRowId}.`);
          }
        } catch (err) {
          console.error('Failed to fetch log details:', err);
          setError(err instanceof Error ? err.message : 'An unknown error occurred while fetching details.');
          setDetailedLog(null);
        } finally {
          setIsDetailLoading(false);
        }
      };
      fetchDetails();
    } else {
      setDetailedLog(null); // Clear details if no row is expanded
      // Reset JSON view states when collapsing
      setShowJson({ card1: false, card2: false, card3: false });
    }
  }, [expandedLogRowId, user?.id, supabaseClient]);

  const handleRowClick = (logId: string) => {
    if (expandedLogRowId === logId) {
      setExpandedLogRowId(null); // Collapse if already expanded
    } else {
      setExpandedLogRowId(logId);
      // Reset JSON view states when expanding a new row
      setShowJson({ card1: false, card2: false, card3: false });
      setError(null); // Clear previous errors related to detail view
    }
  };

  const handleJsonToggle = (cardKey: keyof typeof showJson) => {
    setShowJson(prev => ({ ...prev, [cardKey]: !prev[cardKey] }));
  };

  const handleRerunInteraction = async () => {
    if (!detailedLog || !supabaseClient) return;
    setIsRerunning(true);
    try {
      const { data, error } = await supabaseClient.functions.invoke('rerun-email-interaction', {
        body: { interactionId: detailedLog.id },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Interaction re-run initiated successfully.",
      });
      // Optionally, refresh logs or update status locally
      // For now, just close the expanded view and let user see new status on next load or manual refresh.
      // Or update the status of the current detailedLog:
      setDetailedLog(prev => prev ? {...prev, status: 'processing'} : null);
      // And find the log in the main list and update its status
      setLogs(prevLogs => prevLogs.map(l => l.id === detailedLog.id ? {...l, status: 'processing'} : l));


    } catch (err: any) {
      console.error('Failed to re-run interaction:', err);
      toast({
        title: "Error",
        description: `Failed to re-run interaction: ${err.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      setIsRerunning(false);
    }
  };

  const handleFilterChange = (filter: string) => {
    setSelectedFilter(filter);
    setCurrentPage(1); // Reset to first page on filter change
    if (filter !== 'custom') {
      setCustomStartDate(undefined);
      setCustomEndDate(undefined);
    }
  };

  const handleCustomDateChange = () => {
      if (customStartDate && customEndDate && customStartDate > customEndDate) {
          setError("Start date cannot be after end date.");
          return;
      }
      setError(null);
      setSelectedFilter('custom');
      setCurrentPage(1);
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Activity Logs</h1>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Button variant={selectedFilter === 'today' ? 'default' : 'outline'} onClick={() => handleFilterChange('today')}>Today</Button>
        <Button variant={selectedFilter === '7days' ? 'default' : 'outline'} onClick={() => handleFilterChange('7days')}>7 Days</Button>
        <Button variant={selectedFilter === '30days' ? 'default' : 'outline'} onClick={() => handleFilterChange('30days')}>30 Days</Button>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[280px] justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {customStartDate ?
                (customEndDate ? `${format(customStartDate, 'LLL dd, y')} - ${format(customEndDate, 'LLL dd, y')}` : format(customStartDate, 'LLL dd, y'))
                : <span>Pick a custom date range</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <div className="p-2">
                <p className="text-sm mb-1">Start Date:</p>
                <Calendar mode="single" selected={customStartDate} onSelect={setCustomStartDate} initialFocus />
            </div>
            <div className="p-2 border-t">
                <p className="text-sm mb-1">End Date:</p>
                <Calendar mode="single" selected={customEndDate} onSelect={setCustomEndDate} initialFocus />
            </div>
            <div className="p-2 border-t flex justify-end">
                <Button onClick={handleCustomDateChange} disabled={!customStartDate}>Apply Custom Range</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {isLoading && <p>Loading logs...</p>}
      {error && <p className="text-red-500">Error: {error}</p>}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]"></TableHead> {/* For expand icon */}
            <TableHead>Date/Time</TableHead>
            <TableHead>From</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {!isLoading && logs.length === 0 && (
            <TableRow>
              <TableCell colSpan={5} className="text-center">No activity logs found.</TableCell>
            </TableRow>
          )}
          {logs.map((log) => (
            <React.Fragment key={log.id}>
              <TableRow onClick={() => handleRowClick(log.id)} className="cursor-pointer hover:bg-muted/50">
                <TableCell>
                  {expandedLogRowId === log.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </TableCell>
                <TableCell>{format(new Date(log.created_at), 'Pp')}</TableCell>
                <TableCell>{log.from_email}</TableCell>
                <TableCell>{log.subject}</TableCell>
                <TableCell>{log.status}</TableCell>
              </TableRow>
              {expandedLogRowId === log.id && (
                <TableRow>
                  <TableCell colSpan={5}>
                    {isDetailLoading && <p className="p-4 text-center">Loading details...</p>}
                    {!isDetailLoading && error && expandedLogRowId === log.id && (
                        <div className="p-4 text-center text-red-500 bg-red-50 border border-red-200 rounded-md">{error}</div>
                    )}
                    {!isDetailLoading && detailedLog && (
                      <div className="p-4 space-y-4 bg-muted/20">
                        <div className="flex justify-end">
                           <Button onClick={handleRerunInteraction} disabled={isRerunning} variant="outline" size="sm">
                            {isRerunning ? (
                              <RefreshCwIcon className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <RefreshCwIcon className="mr-2 h-4 w-4" />
                            )}
                            Re-run Interaction
                          </Button>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Card 1: Incoming Email */}
                        <Card>
                          <CardHeader>
                            <CardTitle>Incoming Email</CardTitle>
                            <CardDescription>Raw Postmark request data.</CardDescription>
                            <Button variant="ghost" size="sm" onClick={() => handleJsonToggle('card1')} className="mt-2">
                              {showJson.card1 ? <EyeIcon className="mr-2 h-4 w-4" /> : <CodeIcon className="mr-2 h-4 w-4" />}
                              {showJson.card1 ? 'View Formatted' : 'View JSON'}
                            </Button>
                          </CardHeader>
                          <CardContent className="text-sm space-y-2">
                            {showJson.card1 ? (
                              <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-96 overflow-y-auto text-xs">
                                {JSON.stringify(detailedLog.postmark_request, null, 2)}
                              </pre>
                            ) : (
                              <>
                                <p><strong>From:</strong> {detailedLog.postmark_request?.From}</p>
                                <p><strong>To:</strong> {detailedLog.postmark_request?.To}</p>
                                <p><strong>Subject:</strong> {detailedLog.postmark_request?.Subject}</p>
                                <h4 className="font-semibold mt-2">Body:</h4>
                                <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-60 overflow-y-auto">
                                  {detailedLog.postmark_request?.TextBody || detailedLog.postmark_request?.HtmlBody || 'No body content found.'}
                                </pre>
                              </>
                            )}
                          </CardContent>
                        </Card>

                        {/* Card 2: Webhook Call Plan & Results */}
                        <Card>
                          <CardHeader>
                            <CardTitle>Webhook Call Plan & Results</CardTitle>
                            <CardDescription>Multi-Call Planner execution details.</CardDescription>
                             <Button variant="ghost" size="sm" onClick={() => handleJsonToggle('card2')} className="mt-2">
                              {showJson.card2 ? <EyeIcon className="mr-2 h-4 w-4" /> : <CodeIcon className="mr-2 h-4 w-4" />}
                              {showJson.card2 ? 'View Formatted' : 'View JSON'}
                            </Button>
                          </CardHeader>
                          <CardContent className="text-sm space-y-2 max-h-[30rem] overflow-y-auto"> {/* Increased max-h */}
                            {showJson.card2 ? (
                              <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs">
                                {JSON.stringify({ plan: detailedLog.mcp_plan, results: detailedLog.mcp_results }, null, 2)}
                              </pre>
                            ) : (
                              <>
                                {(!detailedLog.mcp_plan || detailedLog.mcp_plan.length === 0) && <p>No plan steps found.</p>}
                                {detailedLog.mcp_plan?.map((step, index) => (
                                  <div key={index} className="mb-3 pb-3 border-b dark:border-gray-700 last:border-b-0">
                                    <p><strong>Tool:</strong> {step.tool}</p>
                                    <p><strong>Args:</strong></p>
                                    <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs">
                                      {JSON.stringify(step.args, null, 2)}
                                    </pre>
                                    <p className="mt-1"><strong>Status:</strong> {detailedLog.mcp_results?.[index]?.status || 'N/A'}</p>
                                    {detailedLog.mcp_results?.[index]?.status === 'success' && (
                                      <div>
                                        <p><strong>Response:</strong></p>
                                        <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs">
                                          {typeof detailedLog.mcp_results[index].response === 'object' ?
                                            JSON.stringify(detailedLog.mcp_results[index].response, null, 2) :
                                            String(detailedLog.mcp_results[index].response)}
                                        </pre>
                                      </div>
                                    )}
                                    {detailedLog.mcp_results?.[index]?.status === 'error' && (
                                      <p><strong>Error:</strong> {detailedLog.mcp_results[index].error_message}</p>
                                    )}
                                  </div>
                                ))}
                              </>
                            )}
                          </CardContent>
                        </Card>

                        {/* Card 3: Generated Email Response */}
                        <Card>
                          <CardHeader>
                            <CardTitle>Generated Email Response</CardTitle>
                            <CardDescription>KnowReply's output.</CardDescription>
                             <Button variant="ghost" size="sm" onClick={() => handleJsonToggle('card3')} className="mt-2">
                              {showJson.card3 ? <EyeIcon className="mr-2 h-4 w-4" /> : <CodeIcon className="mr-2 h-4 w-4" />}
                              {showJson.card3 ? 'View Formatted' : 'View JSON'}
                            </Button>
                          </CardHeader>
                          <CardContent className="text-sm space-y-2">
                            {showJson.card3 ? (
                              <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-96 overflow-y-auto text-xs">
                                {JSON.stringify(detailedLog.knowreply_response, null, 2)}
                              </pre>
                            ) : (
                              <>
                                {detailedLog.knowreply_response?.reply_email_data ? (
                                  <>
                                    <p><strong>To:</strong> {detailedLog.knowreply_response.reply_email_data.to}</p>
                                    <p><strong>Subject:</strong> {detailedLog.knowreply_response.reply_email_data.subject}</p>
                                    <h4 className="font-semibold mt-2">Body:</h4>
                                    <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-60 overflow-y-auto">
                                      {detailedLog.knowreply_response.reply_email_data.text_body || detailedLog.knowreply_response.reply_email_data.html_body || 'No body content found.'}
                                    </pre>
                                  </>
                                ) : (
                                  <pre className="whitespace-pre-wrap break-all bg-gray-100 dark:bg-gray-800 p-2 rounded text-xs">
                                    {detailedLog.knowreply_response ? JSON.stringify(detailedLog.knowreply_response, null, 2) : 'No return email data found.'}
                                  </pre>
                                )}
                              </>
                            )}
                          </CardContent>
                        </Card>
                        </div>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>

      <div className="flex items-center justify-between mt-4">
        <Button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1 || isLoading}>
          Previous
        </Button>
        <span>Page {currentPage} of {totalPages}</span>
        <Button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages || isLoading || totalPages === 0}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default ActivityLogsPage;
