import { withErrorHandler, apiSuccess } from '@/lib/api-utils';

export const POST = withErrorHandler(async (request) => {
  const errorData = await request.json();

  // Log error to console
  console.error('[ERROR BOUNDARY]', {
    timestamp: errorData.timestamp,
    message: errorData.message,
    url: errorData.url,
    userAgent: errorData.userAgent,
  });

  // In production, you might want to send this to a logging service
  // like Sentry, LogRocket, etc.
  if (process.env.NODE_ENV === 'production') {
    // TODO: Send to external logging service
    // await sendToSentry(errorData);
    // await sendToLogRocket(errorData);
  }

  // Store in database or file system if needed
  // For now, we'll just log to console

  return apiSuccess({ success: true, message: 'Error logged successfully' });
});
