/**
 * @format
 */

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';
import { registerBackgroundHandlers } from './src/notifications/push';

// FCM background/quit-state handler + notifee background events must be
// registered outside the React tree, before the app component (same as the
// consumer app's index.js). No-ops safely if Firebase isn't configured yet.
registerBackgroundHandlers();

AppRegistry.registerComponent(appName, () => App);
