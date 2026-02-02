/**
 * Test interceptor fixture.
 */

import type { WorkflowInterceptorsFactory } from '@temporalio/workflow';

export const interceptors: WorkflowInterceptorsFactory = () => ({
  inbound: [],
  outbound: [],
});
