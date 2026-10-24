import {
  CommonActions,
  StackActions,
  createNavigationContainerRef,
} from '@react-navigation/native';

/**
 * Root navigation ref (attached to <NavigationContainer> in App.js) so
 * non-screen code — the session-expired listener, push tap handlers — can
 * navigate.
 */
export const navigationRef = createNavigationContainerRef();

/** Reset the whole stack to a single route (no back button to the old one). */
export const resetTo = (name, params) => {
  if (!navigationRef.isReady()) {
    return false;
  }
  navigationRef.dispatch(
    CommonActions.reset({index: 0, routes: [{name, params}]}),
  );
  return true;
};

// ---------------------------------------------------------------------------
// Deferred navigation (push-notification taps)
//
// A tap can arrive before the user is inside the app: cold start (Splash is
// still checking the session) or while logged out (Login). Pushing a
// session screen there would be wrong — Splash/Login immediately replace
// themselves with MainTabs. So the target is parked here and the Home tab's
// screen (MainTabs' initial tab) picks it up via consumePendingNavigation()
// once it mounts.
//
// Once inside MainTabs, the root-ref StackActions.push below is handled by
// whichever tab's nested stack is focused — which is why every push target
// (ReportDetail, SupportChatThread, Notifications) is registered in all four
// tab stacks (AppNavigator.js SHARED_SCREENS).
// ---------------------------------------------------------------------------

const GATE_ROUTES = ['Splash', 'Login'];
let _pending = null;

/**
 * Push `name` on top of the current stack now if the user is past the
 * Splash/Login gate, otherwise remember it for the Home tab to open.
 * @returns {boolean} true if navigated immediately
 */
export const pushWhenReady = (name, params) => {
  if (navigationRef.isReady()) {
    const current = navigationRef.getCurrentRoute()?.name;
    if (current && !GATE_ROUTES.includes(current)) {
      _pending = null;
      navigationRef.dispatch(StackActions.push(name, params));
      return true;
    }
  }
  _pending = {name, params};
  return false;
};

/** Take (and clear) the parked navigation target, if any. */
export const consumePendingNavigation = () => {
  const pending = _pending;
  _pending = null;
  return pending;
};

/** Drop the session's screens and land on Login (logout / 401 / expiry). */
export const resetToLogin = () => {
  if (navigationRef.isReady()) {
    const current = navigationRef.getCurrentRoute()?.name;
    if (current === 'Login' || current === 'Splash') {
      return true;
    }
  }
  return resetTo('Login');
};
