import {apiGet, apiPatch} from './client';

// Backend: transitorder internal/handlers/report.go + internal/models/report.go
//
// Every list endpoint returns the shared Paged envelope
// (internal/models/paged.go):
//   { total: number, page: number (1-based), limit: number, items: T[] }
// `items` is always an array (never null).

/** Default page size for the reports queue (backend caps at 100). */
export const REPORTS_PAGE_SIZE = 20;

/** ReportResolution values (ReportAdminUpdateModel.resolution). */
export const REPORT_RESOLUTIONS = [
  'action_taken',
  'no_violation_found',
  'insufficient_evidence',
];

const toQuery = params =>
  Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');

/**
 * GET /v1/admin/reports?status=&page=&limit=
 * Unscoped admin queue, newest first. `status` is a single exact value
 * (submitted | under_review | resolved | closed_no_action) or omitted.
 *
 * @returns {Promise<{total: number, page: number, limit: number, items: object[]}>}
 */
export const listReports = ({status, page = 1, limit = REPORTS_PAGE_SIZE} = {}) =>
  apiGet(`/v1/admin/reports?${toQuery({status, page, limit})}`);

/**
 * GET /v1/reports/{id} — admin token gets the unfiltered status history
 * (with actorId). Note: assignedAgentId / internalNotes / reporterId are
 * `json:"-"` on the model, so they are never returned to anyone.
 */
export const getReport = id => apiGet(`/v1/reports/${encodeURIComponent(id)}`);

/**
 * PATCH /v1/reports/admin/{id}
 *
 * Body (ReportAdminUpdateModel):
 *   status               required, one of the 4 report statuses
 *   resolution           optional, one of REPORT_RESOLUTIONS
 *   reporterMessage      optional, ≤2000 chars (also becomes the new
 *                        statusHistory entry's message)
 *   internalNote         optional, ≤5000 chars (appended, write-only)
 *   assignedAgentId      optional, ≤120 chars (write-only)
 *   suspendReportedUser  optional bool, honored only for reportedType=user
 *
 * Empty optional fields are dropped so they don't overwrite anything.
 * Returns the updated report.
 */
export const updateReportByAdmin = (id, update) => {
  const body = {status: update.status};
  ['resolution', 'reporterMessage', 'internalNote', 'assignedAgentId'].forEach(
    key => {
      const value =
        typeof update[key] === 'string' ? update[key].trim() : update[key];
      if (value) {
        body[key] = value;
      }
    },
  );
  if (update.suspendReportedUser) {
    body.suspendReportedUser = true;
  }
  return apiPatch(`/v1/reports/admin/${encodeURIComponent(id)}`, body);
};

/**
 * GET /v1/admin/overview — admin dashboard stats
 * (transitorder internal/models/stats.go OverviewStats). Fields used here:
 *   totalUsers, totalParcelRequests, totalTripsPosted  number
 *   reportsAwaitingReview  number — submitted + under_review combined, i.e.
 *                          every unresolved report
 * (Also returns signups/deliveriesCompleted/plansCreated/
 * paymentsCollectedMinor/refundsMinor trends and top-cities lists, unused.)
 *
 * @returns {Promise<{totalUsers: number, totalParcelRequests: number,
 *   totalTripsPosted: number, reportsAwaitingReview: number}>}
 */
export const getOverviewStats = () => apiGet('/v1/admin/overview');
