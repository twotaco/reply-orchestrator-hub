// src/components/activity-logs/ActivityLogs.tsx
import React, { useEffect, useState, useCallback, Fragment } from 'react';
import { supabase } from '@/integrations/supabase/client';
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
import { Calendar as CalendarIcon, ChevronDown, ChevronRight, Eye, Code } from 'lucide-react'; // RefreshCw removed
import { format, subDays, startOfDay, endOfDay, isValid } from 'date-fns';
// useToast removed

// Interfaces: EmailInteractionEntry, DisplayableLog, JsonViewStates, FilterPreset, DateRange
interface EmailInteractionEntry {
  id: string;
  created_at: string;
  from_email: string;
  subject: string;
  status: string;
  postmark_request: any;
  mcp_plan: any;
  postmark_response: any;
  knowreply_response: any;
}

interface DisplayableLog {
  id: string;
  dateTime: string;
  from: string;
  subject: string;
  status: string;
  originalEntry: EmailInteractionEntry;
}

interface JsonViewStates {
  incomingEmail: boolean;
  webhookPlan: boolean;
  returnEmail: boolean;
}
type FilterPreset = 'today' | '7days' | '30days' | 'custom';
interface DateRange { from?: Date; to?: Date; }

// Helper functions
function formatEmailList(fullList: any[] | undefined): string {
  if (!fullList || !Array.isArray(fullList) || fullList.length === 0) {
    return 'N/A';
  }
  return fullList.map(p => p.Name ? `${p.Name} <${p.Email}>` : p.Email).join(', ');
}

function RenderEmailDetails({ emailData, showJson }: { emailData: any; showJson: boolean }) {
  if (!emailData) return <p className="text-sm text-gray-500">No email data available for this entry.</p>;

  let parsedData = emailData;
  if (typeof emailData === 'string') {
    try {
      parsedData = JSON.parse(emailData);
    } catch (e) {
      if (!showJson) {
        console.error('Error parsing emailData string:', e);
        return <p className="text-sm text-red-500">Error: Could not parse email data.</p>;
      }
    }
  }

  if (showJson) {
    const jsonDataToShow = (typeof parsedData === 'string' && typeof emailData === 'string') ? emailData : parsedData;
    // Verified: overflow-x-auto is present for JSON view
    return <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded overflow-x-auto">{JSON.stringify(jsonDataToShow, null, 2)}</pre>;
  }

  const from =
  parsedData.FromFull
    ? formatEmailList(Array.isArray(parsedData.FromFull) ? parsedData.FromFull : [parsedData.FromFull])
    : parsedData.From || parsedData.from || "N/A";

  const to =
    parsedData.ToFull
      ? formatEmailList(parsedData.ToFull)
      : parsedData.To
      ? (Array.isArray(parsedData.To) ? parsedData.To.join(", ") : String(parsedData.To))
      : parsedData.to
      ? (Array.isArray(parsedData.to) ? parsedData.to.join(", ") : String(parsedData.to))
      : "N/A";

  const cc =
    parsedData.CcFull
      ? formatEmailList(parsedData.CcFull)
      : parsedData.Cc
      ? (Array.isArray(parsedData.Cc) ? parsedData.Cc.join(", ") : String(parsedData.Cc))
      : parsedData.cc
      ? (Array.isArray(parsedData.cc) ? parsedData.cc.join(", ") : String(parsedData.cc))
      : null;

  const subject = parsedData.Subject || parsedData.subject || "N/A";
  const dateValue = parsedData.Date || parsedData.date || "";
  const replyTo = parsedData.ReplyTo || parsedData.reply_to || null;

  const bodyHtml = parsedData.HtmlBody || parsedData.html_body || null;
  const bodyText = parsedData.TextBody || parsedData.body || parsedData.text_body || null;

/*
  // Temp fix
  const from = parsedData.FromFull ? formatEmailList([parsedData.FromFull]) : parsedData.From || 'N/A';
  const to = parsedData.ToFull ? formatEmailList(parsedData.ToFull) : parsedData.To || 'N/A';
  const cc = parsedData.CcFull ? formatEmailList(parsedData.CcFull) : parsedData.Cc || 'N/A';
  const subject = parsedData.Subject || 'N/A';
  const dateValue = parsedData.Date || 'N/A';
  const replyTo = parsedData.ReplyTo || 'N/A';
  const bodyHtml = parsedData.HtmlBody || null;
  const bodyText = parsedData.TextBody || null;
  */
  let bodyContent;

  if (bodyHtml) {
    // Added overflow-x-auto to the div rendering HTML content
    bodyContent = <div dangerouslySetInnerHTML={{ __html: bodyHtml }} className="prose prose-sm max-w-none overflow-x-auto" />;
  } else if (bodyText) {
    // Added overflow-x-auto to the pre tag for TextBody
    bodyContent = <pre className="whitespace-pre-wrap text-sm overflow-x-auto">{bodyText}</pre>;
  } else {
    bodyContent = <p className="text-sm text-gray-500">No body content available.</p>;
  }

  const attachments = parsedData.Attachments;
  let attachmentDisplay = null;
  if (attachments && Array.isArray(attachments) && attachments.length > 0) {
    attachmentDisplay = (
      <div>
        <p className="font-semibold mt-2">Attachments:</p>
        <ul className="list-disc list-inside text-sm">
          {attachments.map((att: any, index: number) => (
            <li key={index}>{att.Name} ({att.ContentType || 'N/A'})</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p><strong>From:</strong> {from}</p>
      <p><strong>To:</strong> {to}</p>
      {cc !== 'N/A' && cc !== '' && <p><strong>Cc:</strong> {cc}</p>}
      {replyTo !== 'N/A' && replyTo !== '' && <p><strong>Reply-To:</strong> {replyTo}</p>}
      <p><strong>Subject:</strong> {subject}</p>
      {dateValue !== 'N/A' && <p><strong>Date:</strong> {new Date(dateValue).toLocaleString()}</p>}
      <hr className="my-2" />
      <p className="font-semibold">Body:</p>
      {/* This parent div handles vertical scroll for the body area */}
      <div className="overflow-y-auto max-h-60 border p-2 rounded bg-gray-50">
         {bodyContent} {/* bodyContent itself now handles x-scroll */}
      </div>
      {attachmentDisplay}
    </div>
  );
}

function RenderToolPlan({ planData, showJson }: { planData: any; showJson: boolean }) {
  if (!planData) return <p className="text-sm text-gray-500">No MCP plan data available for this entry.</p>;

  let parsedPlan = planData;
  if (typeof planData === 'string') {
    try {
      parsedPlan = JSON.parse(planData);
    } catch (e) {
      if (!showJson) {
        console.error('Error parsing mcp_plan string:', e);
        return <p className="text-sm text-red-500">Error: Could not parse MCP plan data.</p>;
      }
    }
  }

  if (showJson) {
    const jsonDataToShow = (typeof parsedPlan === 'string' && typeof planData === 'string') ? planData : parsedPlan;
    // Verified: overflow-x-auto is present for JSON view
    return <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded overflow-x-auto">{JSON.stringify(jsonDataToShow, null, 2)}</pre>;
  }

  if (!Array.isArray(parsedPlan)) {
    console.warn('MCP Plan data is not an array:', parsedPlan);
    return (
      <div>
        <p className="text-sm text-orange-500 mb-1">MCP Plan is not in the expected array format.</p>
        <p className="text-xs text-gray-600 mb-2">Displaying raw data instead:</p>
        {/* Verified: overflow-x-auto is present for raw data display */}
        <pre className="whitespace-pre-wrap text-xs bg-gray-100 p-2 rounded overflow-x-auto">
          {JSON.stringify(parsedPlan, null, 2)}
        </pre>
      </div>
    );
  }

  if (parsedPlan.length === 0) {
    return <p className="text-sm text-gray-500">MCP Plan is empty.</p>;
  }

  return (
    <ul className="space-y-3 text-sm">
      {parsedPlan.map((step, index) => (
        <li key={index} className="p-3 border rounded-md bg-gray-50 shadow-sm">
          <p className="font-semibold text-gray-700">
            Step {index + 1}: {step.tool || 'N/A'}
          </p>
          <p className="text-gray-700">
            Reasoning: {step.reasoning || 'N/A'}
          </p>
          {step.args && Object.keys(step.args).length > 0 ? (
            <div className="mt-1">
              <p className="text-xs font-medium text-gray-600">Arguments:</p>
              {/* Verified: overflow-x-auto is present for step.args */}
              <pre className="whitespace-pre-wrap text-xs bg-white border border-gray-200 p-2 mt-1 rounded overflow-x-auto">
                {JSON.stringify(step.args, null, 2)}
              </pre>
            </div>
          ) : (
            <p className="text-xs text-gray-500 mt-1">No arguments provided for this step.</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ActivityLogs() {
  const [logs, setLogs] = useState<DisplayableLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterPreset>('7days');
  const [customDateRange, setCustomDateRange] = useState<DateRange | undefined>(undefined);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [jsonViewStates, setJsonViewStates] = useState<JsonViewStates>({
    incomingEmail: false,
    webhookPlan: false,
    returnEmail: false,
  });

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase
      .from('email_interactions')
      .select('id, created_at, from_email, subject, status, postmark_request, mcp_plan, postmark_response, knowreply_response')
      .order('created_at', { ascending: false })
      .limit(100);

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
        const processedLogs: DisplayableLog[] = data.map((log: EmailInteractionEntry) => ({
          id: log.id,
          dateTime: new Date(log.created_at).toLocaleString(),
          from: log.from_email || 'N/A',
          subject: log.subject || 'N/A',
          status: log.status || 'N/A',
          originalEntry: log,
        }));
        setLogs(processedLogs);
      }
    } catch (err: any) {
      console.error('Error fetching activity logs:', err);
      setError(err.message || 'Failed to fetch activity logs.');
    } finally {
      setLoading(false);
    }
  }, [activeFilter, customDateRange]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleFilterChange = (filter: FilterPreset) => { setActiveFilter(filter); if (filter !== 'custom') setCustomDateRange(undefined);};
  const handleDateRangeChange = (range: DateRange | undefined) => { setCustomDateRange(range); setActiveFilter('custom');};

  const toggleRowExpansion = (logId: string) => {
    const newExpandedId = expandedRowId === logId ? null : logId;
    setExpandedRowId(newExpandedId);
    if (newExpandedId !== expandedRowId || !newExpandedId ) {
      setJsonViewStates({ incomingEmail: false, webhookPlan: false, returnEmail: false });
    }
  };

  const toggleJsonView = (cardType: keyof JsonViewStates, event: React.MouseEvent) => {
    event.stopPropagation();
    setJsonViewStates(prev => ({ ...prev, [cardType]: !prev[cardType] }));
  };

  if (error) {
    return ( <div className="p-4"> <h1 className="text-2xl font-semibold mb-4">Activity Logs</h1> <p className="text-red-500">Error: {error}</p> </div> );
  }

  return (
    <div className="p-4">
      <h1 className="text-2xl font-semibold mb-4">Activity Logs</h1>
      <div className="flex flex-wrap items-center gap-2 mb-4">
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

      {loading ? ( <p className="text-center py-4">Loading logs...</p> ) :
       logs.length === 0 ? ( <p className="text-center py-4">No activity logs found for the selected period.</p> ) : (
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
                <TableRow onClick={() => toggleRowExpansion(log.id)} className="cursor-pointer hover:bg-muted/50">
                  <TableCell>
                    {expandedRowId === log.id ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                  </TableCell>
                  <TableCell>{log.dateTime}</TableCell>
                  <TableCell>{log.from}</TableCell>
                  <TableCell>{log.subject}</TableCell>
                  <TableCell>
                    <Badge variant={log.status && (log.status.toLowerCase().includes('error') || log.status.toLowerCase().includes('failed')) ? 'destructive' : 'default'}>
                      {log.status}
                    </Badge>
                  </TableCell>
                </TableRow>
                {expandedRowId === log.id && (
                  <TableRow>
                    <TableCell colSpan={5} className="p-0">
                      <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4 bg-muted/20">
                        <Card>
                          <CardHeader><CardTitle>Incoming Email</CardTitle></CardHeader>
                          <CardContent>
                            <RenderEmailDetails emailData={log.originalEntry.postmark_request} showJson={jsonViewStates.incomingEmail} />
                          </CardContent>
                          <CardFooter className="flex justify-end">
                             <Button variant="outline" size="sm" onClick={(e) => toggleJsonView('incomingEmail', e)}>
                              {jsonViewStates.incomingEmail ? <Eye className="mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />}
                              {jsonViewStates.incomingEmail ? 'View Formatted' : 'View JSON'}
                            </Button>
                          </CardFooter>
                        </Card>
                        <Card>
                          <CardHeader><CardTitle>Connected Tools Called</CardTitle></CardHeader>
                          <CardContent>
                            <RenderToolPlan planData={log.originalEntry.mcp_plan} showJson={jsonViewStates.webhookPlan} />
                          </CardContent>
                           <CardFooter className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={(e) => toggleJsonView('webhookPlan', e)}>
                              {jsonViewStates.webhookPlan ? <Eye className="mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />}
                              {jsonViewStates.webhookPlan ? 'View Formatted' : 'View JSON'}
                            </Button>
                          </CardFooter>
                        </Card>
                        <Card>
                          <CardHeader><CardTitle>Return Email/Response</CardTitle></CardHeader>
                          <CardContent>
                            <RenderEmailDetails emailData={log.originalEntry.knowreply_response.reply} showJson={jsonViewStates.returnEmail} />
                          </CardContent>
                           <CardFooter className="flex justify-end">
                            <Button variant="outline" size="sm" onClick={(e) => toggleJsonView('returnEmail', e)}>
                              {jsonViewStates.returnEmail ? <Eye className="mr-2 h-4 w-4" /> : <Code className="mr-2 h-4 w-4" />}
                              {jsonViewStates.returnEmail ? 'View Formatted' : 'View JSON'}
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
