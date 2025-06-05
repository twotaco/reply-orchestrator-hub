// src/components/activity-logs/ActivityLogs.tsx
import React, { useEffect, useState, useCallback, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
// ... other imports (Table, Badge, Button, Calendar, Popover, Card, Icons, date-fns)
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Eye, Code, RefreshCw } from 'lucide-react'; // Added RefreshCw
import { format, subDays, startOfDay, endOfDay, isValid } from 'date-fns';
import { useToast } from '@/components/ui/use-toast'; // For showing success/error messages

// Interfaces (LogEntry, DisplayableLog, JsonViewStates - assume defined as in previous step)
interface LogEntry {
  id: string;
  created_at: string;
  prompt_messages: any;
  llm_response: any;
  tool_plan_generated: any;
  error_message?: string | null;
}

interface DisplayableLog {
  id: string;
  dateTime: string;
  from: string;
  subject: string;
  status: 'Success' | 'Error';
  originalEntry: LogEntry;
}

interface JsonViewStates {
  incomingEmail: boolean;
  webhookPlan: boolean;
  returnEmail: boolean;
}

// extractEmailData, RenderEmailDetails, RenderToolPlan functions (assume defined as in previous step)
function extractEmailData(promptMessages: any): { from: string; subject: string } {
  let from = 'N/A';
  let subject = 'N/A';
  try {
    const messages = typeof promptMessages === 'string' ? JSON.parse(promptMessages) : promptMessages;
    const primaryMessage = Array.isArray(messages) ? messages[0] : messages;
    if (primaryMessage) {
      if (primaryMessage.FromFull && primaryMessage.FromFull.Email) {
        from = primaryMessage.FromFull.Name ? `${primaryMessage.FromFull.Name} <${primaryMessage.FromFull.Email}>` : primaryMessage.FromFull.Email;
      } else if (primaryMessage.from_full && primaryMessage.from_full.email) {
         from = primaryMessage.from_full.name ? `${primaryMessage.from_full.name} <${primaryMessage.from_full.email}>` : primaryMessage.from_full.email;
      } else if (typeof primaryMessage.From === 'string') {
        from = primaryMessage.From;
      } else if (typeof primaryMessage.from === 'string') {
        from = primaryMessage.from;
      }
      if (typeof primaryMessage.Subject === 'string') subject = primaryMessage.Subject;
      else if (typeof primaryMessage.subject === 'string') subject = primaryMessage.subject;
    }
  } catch (e) { console.error('Error parsing prompt_messages for table:', e); }
  return { from, subject };
}

function RenderEmailDetails({ emailData, showJson }: { emailData: any; showJson: boolean }) {
  if (!emailData) return <p>No email data available.</p>;
  if (showJson) {
    try { const jsonData = typeof emailData === 'string' ? JSON.parse(emailData) : emailData; return <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded">{JSON.stringify(jsonData, null, 2)}</pre>; }
    catch (e) { return <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded">{emailData}</pre>; }
  }
  let parsedData = emailData;
  if (typeof emailData === 'string') { try { parsedData = JSON.parse(emailData); } catch (e) { return <pre>{emailData}</pre>; } }
  const from = parsedData.From || parsedData.from || (parsedData.FromFull ? `${parsedData.FromFull.Name} <${parsedData.FromFull.Email}>` : 'N/A');
  const to = parsedData.To || parsedData.to || (parsedData.ToFull ? parsedData.ToFull.map((t:any) => t.Email).join(', ') : 'N/A');
  const subjectValue = parsedData.Subject || parsedData.subject || 'N/A'; // Renamed to avoid conflict
  const body = parsedData.TextBody || parsedData.HtmlBody || parsedData.Body || parsedData.body || 'No body content.';
  const date = parsedData.Date || (parsedData.originalEntry?.created_at ? new Date(parsedData.originalEntry.created_at).toLocaleString() : 'N/A');
  return ( <div className="space-y-2 text-sm"> <p><strong>From:</strong> {from}</p> <p><strong>To:</strong> {to}</p> <p><strong>Subject:</strong> {subjectValue}</p> <p><strong>Date:</strong> {date}</p> <hr className="my-2" /> <p><strong>Body:</strong></p> {parsedData.HtmlBody || (parsedData.body && (typeof parsedData.body === 'string' && parsedData.body.includes('<') && parsedData.body.includes('>'))) ? ( <div dangerouslySetInnerHTML={{ __html: body }} /> ) : ( <pre className="whitespace-pre-wrap">{body}</pre> )} </div> );
}

function RenderToolPlan({ planData, showJson }: { planData: any; showJson: boolean }) {
  if (!planData) return <p>No tool plan data available.</p>;
  if (showJson) {
    try { const jsonData = typeof planData === 'string' ? JSON.parse(planData) : planData; return <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded">{JSON.stringify(jsonData, null, 2)}</pre>; }
    catch (e) { return <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded">{planData}</pre>; }
  }
  let parsedPlan = planData;
  if (typeof planData === 'string') { try { parsedPlan = JSON.parse(planData); } catch (e) { return <pre>{planData}</pre>; } }
  if (Array.isArray(parsedPlan)) { return ( <ul className="list-disc pl-5 space-y-1 text-sm"> {parsedPlan.map((step, index) => ( <li key={index}> <strong>Tool:</strong> {step.tool_name || step.mcp_name || 'N/A'} <br /> <strong>Parameters:</strong> <pre className="whitespace-pre-wrap text-xs">{JSON.stringify(step.parameters || step.values, null, 2)}</pre> <strong>Result:</strong> {step.status_result || step.status || 'N/A'} </li> ))} </ul> ); }
  return <pre className="whitespace-pre-wrap text-sm">{JSON.stringify(parsedPlan, null, 2)}</pre>;
}


type FilterPreset = 'today' | '7days' | '30days' | 'custom';
interface DateRange { from?: Date; to?: Date; }

export function ActivityLogs() {
  const [logs, setLogs] = useState<DisplayableLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterPreset>('7days');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [jsonViewStates, setJsonViewStates] = useState<JsonViewStates>({ incomingEmail: false, webhookPlan: false, returnEmail: false });
  const [isReRunning, setIsReRunning] = useState<string | null>(null); // Tracks ID of log being re-run
  const { toast } = useToast();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('llm_logs')
      .select('id, created_at, prompt_messages, llm_response, tool_plan_generated, error_message')
      .order('created_at', { ascending: false })
      .limit(100);
    // Date filtering logic
    let dateFrom: Date | undefined;
    let dateTo: Date | undefined = endOfDay(new Date());
    if (activeFilter === 'today') dateFrom = startOfDay(new Date());
    else if (activeFilter === '7days') dateFrom = startOfDay(subDays(new Date(), 6));
    else if (activeFilter === '30days') dateFrom = startOfDay(subDays(new Date(), 29));
    else if (activeFilter === 'custom' && customDateRange) {
      dateFrom = customDateRange.from ? startOfDay(customDateRange.from) : undefined;
      dateTo = customDateRange.to ? endOfDay(customDateRange.to) : endOfDay(new Date());
      if (dateFrom && dateTo && dateFrom > dateTo) dateTo = endOfDay(dateFrom);
    }
    if (dateFrom && isValid(dateFrom)) query = query.gte('created_at', dateFrom.toISOString());
    if (dateTo && isValid(dateTo)) query = query.lte('created_at', dateTo.toISOString());

    try {
      const { data, error: supabaseError } = await query;
      if (supabaseError) throw supabaseError;
      if (data) {
        const processedLogs: DisplayableLog[] = data.map((log: LogEntry) => {
          const { from, subject } = extractEmailData(log.prompt_messages);
          return { id: log.id, dateTime: new Date(log.created_at).toLocaleString(), from, subject, status: log.error_message ? 'Error' : 'Success', originalEntry: log };
        });
        setLogs(processedLogs);
      }
    } catch (err: any) { console.error('Error fetching activity logs:', err); setError(err.message || 'Failed to fetch activity logs.'); }
    finally { setLoading(false); }
  }, [activeFilter, customDateRange]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleFilterChange = (filter: FilterPreset) => { setActiveFilter(filter); if (filter !== 'custom') setCustomDateRange(undefined); };
  const handleDateRangeChange = (range: DateRange | undefined) => { setCustomDateRange(range); setActiveFilter('custom'); };
  const toggleRowExpansion = (logId: string) => { const newId = expandedRowId === logId ? null : logId; setExpandedRowId(newId); if (newId !== expandedRowId || !newId) setJsonViewStates({ incomingEmail: false, webhookPlan: false, returnEmail: false }); };
  const toggleJsonView = (cardType: keyof JsonViewStates) => { setJsonViewStates(prev => ({ ...prev, [cardType]: !prev[cardType] })); };

  const handleReRun = async (logEntry: LogEntry, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent row collapse
    setIsReRunning(logEntry.id);
    try {
      // Ensure prompt_messages is an object, not a string
      const payload = typeof logEntry.prompt_messages === 'string'
        ? JSON.parse(logEntry.prompt_messages)
        : logEntry.prompt_messages;

      const { data, error } = await supabase.functions.invoke('postmark-webhook', {
        body: payload,
        // If the function expects headers, they might need to be set here too.
        // headers: { 'Content-Type': 'application/json' } // Usually set by default for JSON body
      });

      if (error) throw error;

      toast({
        title: "Re-run Successful",
        description: `Webhook (ID: ${logEntry.id}) re-processed successfully.`,
      });
      fetchLogs(); // Refresh logs to see new entry if any
    } catch (err: any) {
      console.error('Error re-running webhook:', err);
      toast({
        title: "Re-run Failed",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsReRunning(null);
    }
  };

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold mb-4">Activity Logs</h1>
        <p className="text-red-500">Error: {error}</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Activity Logs</h1>
      {/* Filter controls UI ... */}
      <div className="flex items-center space-x-2 mb-4">
        <Button variant={activeFilter === 'today' ? 'default' : 'outline'} onClick={() => handleFilterChange('today')}>Today</Button>
        <Button variant={activeFilter === '7days' ? 'default' : 'outline'} onClick={() => handleFilterChange('7days')}>7 Days</Button>
        <Button variant={activeFilter === '30days' ? 'default' : 'outline'} onClick={() => handleFilterChange('30days')}>30 Days</Button>
        <Popover>
          <PopoverTrigger asChild>
            <Button id="date" variant={activeFilter === 'custom' ? 'default' : 'outline'} className="w-auto justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {customDateRange?.from ? (customDateRange.to ? `${format(customDateRange.from, 'LLL dd, y')} - ${format(customDateRange.to, 'LLL dd, y')}` : format(customDateRange.from, 'LLL dd, y')) : (<span>Pick a date range</span>)}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar initialFocus mode="range" defaultMonth={customDateRange?.from} selected={customDateRange} onSelect={(range) => handleDateRangeChange(range ? {from: range.from, to: range.to} : undefined)} numberOfMonths={2}/>
          </PopoverContent>
        </Popover>
      </div>


      {loading ? ( <p>Loading logs...</p> ) :
       logs.length === 0 ? ( <p>No activity logs found for the selected period.</p> ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]"></TableHead>
              <TableHead>Date/Time</TableHead>
              <TableHead>From</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <Fragment key={log.id}>
                <TableRow onClick={() => toggleRowExpansion(log.id)} className="cursor-pointer">
                  <TableCell> {expandedRowId === log.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />} </TableCell>
                  <TableCell>{log.dateTime}</TableCell>
                  <TableCell>{log.from}</TableCell>
                  <TableCell>{log.subject}</TableCell>
                  <TableCell><Badge variant={log.status === 'Error' ? 'destructive' : 'default'}>{log.status}</Badge></TableCell>
                </TableRow>
                {expandedRowId === log.id && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-gray-50">
                        {/* Incoming Email Card */}
                        <Card>
                          <CardHeader><CardTitle>Incoming Email</CardTitle></CardHeader>
                          <CardContent>
                            <RenderEmailDetails emailData={log.originalEntry.prompt_messages} showJson={jsonViewStates.incomingEmail} />
                          </CardContent>
                          <CardFooter className="flex justify-between items-center"> {/* Changed for multiple buttons */}
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toggleJsonView('incomingEmail'); }}>
                              {jsonViewStates.incomingEmail ? <Eye className="mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />}
                              {jsonViewStates.incomingEmail ? 'Formatted' : 'JSON'}
                            </Button>
                            <Button variant="outline" size="sm" onClick={(e) => handleReRun(log.originalEntry, e)} disabled={isReRunning === log.originalEntry.id}>
                              <RefreshCw className={`mr-2 h-4 w-4 ${isReRunning === log.originalEntry.id ? 'animate-spin' : ''}`} />
                              {isReRunning === log.originalEntry.id ? 'Re-running...' : 'Re-run'}
                            </Button>
                          </CardFooter>
                        </Card>
                        {/* Webhook Call Plan Card (with its JSON toggle) */}
                        <Card>
                          <CardHeader><CardTitle>Webhook Call Plan</CardTitle></CardHeader>
                          <CardContent>
                            <RenderToolPlan planData={log.originalEntry.tool_plan_generated} showJson={jsonViewStates.webhookPlan} />
                          </CardContent>
                           <CardFooter className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toggleJsonView('webhookPlan'); }}>
                              {jsonViewStates.webhookPlan ? <Eye className="mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />}
                              {jsonViewStates.webhookPlan ? 'Formatted' : 'JSON'}
                            </Button>
                          </CardFooter>
                        </Card>
                        {/* Return Email/Response Card (with its JSON toggle) */}
                        <Card>
                          <CardHeader><CardTitle>Return Email/Response</CardTitle></CardHeader>
                          <CardContent>
                            <RenderEmailDetails emailData={log.originalEntry.llm_response} showJson={jsonViewStates.returnEmail} />
                          </CardContent>
                           <CardFooter className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); toggleJsonView('returnEmail'); }}>
                              {jsonViewStates.returnEmail ? <Eye className="mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />}
                              {jsonViewStates.returnEmail ? 'Formatted' : 'JSON'}
                            </Button>
                          </CardFooter>
                        </Card>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
