import {apiGet, apiPost, isUnauthorizedError} from './client';
import {getUser, rememberUser} from './users';

// Resolves "who/what is this report about" into full records, so the detail
// screen can show the sender, traveler, request and trip — not just an ID.
//
//   reportedType "request" → reportedId is a parcel-match ID:
//     GET /v1/parcel-matches/{id}           (admin view: senderUserId,
//                                            travelerUserId, travelPlanId,
//                                            agreedPrice, pricing, disputed…)
//     GET /v1/users/{senderUserId}          ┐ in parallel (admin view adds
//     GET /v1/users/{travelerUserId}        │ underInvestigation, ban*/unban*)
//     GET /v1/admin/travel-plans/{planId}   ┘
//   reportedType "user"    → GET /v1/users/{reportedId}
//   reportedType "system"  → nothing to resolve.
//
//   Independently of reportedType, report.reporterId (admin-only field, see
//   transitorder models.ReportAdminView) → GET /v1/users/{reporterId}, in
//   parallel with the above.

/** GET /v1/parcel-matches/{id} — admin token gets the full ParcelMatchView. */
export const getParcelMatch = id =>
  apiGet(`/v1/parcel-matches/${encodeURIComponent(id)}`);

/**
 * POST /v1/admin/parcel-matches/{id}/resolve-dispute (admin only).
 * Body ResolveDisputeModel: {refundAmount: number ≥ 0, reason: string 3–500}.
 * Server rejects (409) a match that isn't `disputed` or whose
 * `cancellation.policy` is already "admin_dispute_resolution", and (400) a
 * refundAmount above the captured amount (see capturedParcelAmount).
 * Returns the updated ParcelMatchView — the resolution lands on
 * `match.cancellation`.
 */
export const resolveParcelMatchDispute = (id, {refundAmount, reason}) =>
  apiPost(`/v1/admin/parcel-matches/${encodeURIComponent(id)}/resolve-dispute`, {
    refundAmount,
    reason,
  });

/** GET /v1/admin/travel-plans/{id} */
export const getTravelPlan = id =>
  apiGet(`/v1/admin/travel-plans/${encodeURIComponent(id)}`);

/**
 * Run one lookup; never throws. A missing id resolves to {data: null,
 * error: null}; a failed fetch resolves to {data: null, error}.
 * 401s are rethrown-as-null too — the API client has already fired the
 * session-expired redirect.
 */
const safe = async (id, fetcher) => {
  if (!id) {
    return {data: null, error: null};
  }
  try {
    return {data: await fetcher(id), error: null};
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      console.warn('[reportContext] lookup failed:', id, error?.message);
    }
    return {data: null, error};
  }
};

/**
 * Resolve a parcel-match id into the match + sender + traveler + trip
 * records — the "request" half of resolveReportContext, pulled out on its
 * own so a screen that has a matchId but no Report (the support-chat Thread
 * screen, which is now reached directly from "Report an issue" in the
 * consumer app without a Report ever being filed) can show the same
 * request/sender/traveler context without needing one.
 *
 * @param {string} matchId
 * @returns {Promise<{
 *   match: object|null, sender: object|null, traveler: object|null,
 *   travelPlan: object|null,
 *   errors: {match?: Error, sender?: Error, traveler?: Error, travelPlan?: Error}
 * }>}
 */
export const resolveMatchContext = async matchId => {
  const result = {match: null, sender: null, traveler: null, travelPlan: null, errors: {}};
  const assign = (key, outcome) => {
    result[key] = outcome.data;
    if (outcome.error) {
      result.errors[key] = outcome.error;
    }
  };

  const match = await safe(matchId, getParcelMatch);
  assign('match', match);
  if (!match.data) {
    return result;
  }
  const {senderUserId, travelerUserId, travelPlanId} = match.data;
  const [sender, traveler, travelPlan] = await Promise.all([
    safe(senderUserId, getUser),
    safe(travelerUserId, getUser),
    safe(travelPlanId, getTravelPlan),
  ]);
  assign('sender', sender);
  assign('traveler', traveler);
  assign('travelPlan', travelPlan);
  return result;
};

/**
 * Resolve everything a report points at. Partial by design: one failing
 * lookup (e.g. a deleted user) leaves that key null and records the error in
 * `errors`, without blocking the others.
 *
 * @param {object} report
 * @returns {Promise<{
 *   match: object|null, sender: object|null, traveler: object|null,
 *   travelPlan: object|null, reportedUser: object|null,
 *   reporter: object|null,
 *   errors: {match?: Error, sender?: Error, traveler?: Error,
 *            travelPlan?: Error, reportedUser?: Error, reporter?: Error}
 * }>}
 */
export const resolveReportContext = async report => {
  const result = {
    match: null,
    sender: null,
    traveler: null,
    travelPlan: null,
    reportedUser: null,
    reporter: null,
    errors: {},
  };

  const assign = (key, outcome) => {
    result[key] = outcome.data;
    if (outcome.error) {
      result.errors[key] = outcome.error;
    }
  };

  // Started first and awaited last, so it runs alongside the reported-
  // entity lookups below (and still runs for system reports / reports
  // without a reportedId). `safe` never throws, so a failed reporter lookup
  // can't block the rest.
  const reporterLookup = safe(report?.reporterId, getUser);

  const resolveReported = async () => {
    if (!report?.reportedId) {
      return;
    }

    if (report.reportedType === 'user') {
      assign('reportedUser', await safe(report.reportedId, getUser));
      return;
    }

    if (report.reportedType === 'request') {
      const matchContext = await resolveMatchContext(report.reportedId);
      result.match = matchContext.match;
      result.sender = matchContext.sender;
      result.traveler = matchContext.traveler;
      result.travelPlan = matchContext.travelPlan;
      Object.assign(result.errors, matchContext.errors);
    }
  };

  const [reporter] = await Promise.all([reporterLookup, resolveReported()]);
  assign('reporter', reporter);
  // Fresh full profile — seed the shared name cache the Reports list uses.
  rememberUser(reporter.data);

  return result;
};
