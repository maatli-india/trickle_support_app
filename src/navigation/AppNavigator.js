import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {FileWarning, House, Settings} from 'lucide-react-native';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/Home';
import IssuesScreen from '../screens/Issues';
import SettingsScreen from '../screens/Settings';
import ReportDetailScreen from '../screens/ReportDetail';
import NotificationsScreen from '../screens/Notifications';
import SupportChatThreadScreen from '../screens/SupportChat/Thread';
import {workhorse} from '../constants/colors';
import fonts from '../constants/fonts';
import radius from '../constants/radius';

// Route tree:
//
//   Root stack:  Splash → Login → MainTabs
//   MainTabs (bottom tabs, custom bar):
//     HomeTab     → Home            + SHARED_SCREENS
//     IssuesTab   → Issues          + SHARED_SCREENS
//     SettingsTab → Settings        + SHARED_SCREENS
//
// Cross-tab navigation targets the tab route plus its root screen, e.g.
// navigation.navigate('IssuesTab', {screen: 'Issues', params: {...}}).
//
// IssuesTab replaces what used to be separate Reports and Chats tabs — a
// request's filed Report and its support-chat thread are now considered the
// SAME issue (one row), not two disconnected list entries on two different
// tabs. See screens/Issues/index.js for the merge.

const RootStack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TAB_META = {
  HomeTab: {label: 'Home', Icon: House},
  IssuesTab: {label: 'Issues', Icon: FileWarning},
  SettingsTab: {label: 'Settings', Icon: Settings},
};

const CustomTabBar = ({state, descriptors, navigation}) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.tabBar, {paddingBottom: Math.max(insets.bottom, 10)}]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const {options} = descriptors[route.key];
        const meta = TAB_META[route.name];
        const label = options.tabBarLabel ?? meta?.label ?? route.name;
        const Icon = meta?.Icon;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            style={styles.tabItem}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{selected: focused}}>
            <View style={[styles.tabInner, focused && styles.tabInnerActive]}>
              {Icon && (
                <Icon
                  size={20}
                  color={focused ? workhorse.surface : workhorse.muted}
                  strokeWidth={focused ? 2.2 : 1.8}
                />
              )}
              <Text
                style={[
                  styles.tabLabel,
                  {color: focused ? workhorse.surface : workhorse.muted},
                ]}>
                {label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
};

// Every screen reachable from a push notification (or from the Notifications
// screen itself) is registered identically inside ALL three tab stacks.
// pushWhenReady() dispatches StackActions.push via the root ref, and that
// push resolves against whichever tab's stack currently has focus — so a
// screen registered in only one tab's stack would be unreachable whenever a
// different tab is focused. Registering the same screen in several
// navigators is supported; navigate()/push() from inside these screens
// resolve to the nearest stack, so their call sites need no tab awareness.
const SHARED_SCREENS = [
  {name: 'ReportDetail', component: ReportDetailScreen},
  {name: 'Notifications', component: NotificationsScreen},
  {name: 'SupportChatThread', component: SupportChatThreadScreen},
];

const renderSharedScreens = () =>
  SHARED_SCREENS.map(({name, component}) => (
    <Stack.Screen key={name} name={name} component={component} />
  ));

const HomeStack = () => (
  <Stack.Navigator screenOptions={{headerShown: false}}>
    <Stack.Screen name="Home" component={HomeScreen} />
    {renderSharedScreens()}
  </Stack.Navigator>
);

const IssuesStack = () => (
  <Stack.Navigator screenOptions={{headerShown: false}}>
    <Stack.Screen name="Issues" component={IssuesScreen} />
    {renderSharedScreens()}
  </Stack.Navigator>
);

const SettingsStack = () => (
  <Stack.Navigator screenOptions={{headerShown: false}}>
    <Stack.Screen name="Settings" component={SettingsScreen} />
    {renderSharedScreens()}
  </Stack.Navigator>
);

const renderTabBar = props => <CustomTabBar {...props} />;

const MainTabs = () => (
  <View style={styles.root}>
    <Tab.Navigator screenOptions={{headerShown: false}} tabBar={renderTabBar}>
      <Tab.Screen name="HomeTab" component={HomeStack} />
      <Tab.Screen name="IssuesTab" component={IssuesStack} />
      <Tab.Screen name="SettingsTab" component={SettingsStack} />
    </Tab.Navigator>
  </View>
);

export default function AppNavigator() {
  return (
    <RootStack.Navigator
      initialRouteName="Splash"
      screenOptions={{
        headerShown: false,
      }}>
      <RootStack.Screen name="Splash" component={SplashScreen} />
      <RootStack.Screen name="Login" component={LoginScreen} />
      <RootStack.Screen name="MainTabs" component={MainTabs} />
    </RootStack.Navigator>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: workhorse.background},
  tabBar: {
    flexDirection: 'row',
    backgroundColor: workhorse.surface,
    borderTopWidth: 1,
    borderTopColor: workhorse.border,
    paddingTop: 8,
    paddingHorizontal: 8,
  },
  tabItem: {flex: 1, alignItems: 'stretch', paddingHorizontal: 4},
  tabInner: {
    width: '100%',
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  tabInnerActive: {backgroundColor: workhorse.ink},
  tabLabel: {fontFamily: fonts.body, fontSize: 11, marginTop: 4},
});
