import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {Bell} from 'lucide-react-native';
import {workhorse} from '../constants/colors';
import fonts from '../constants/fonts';

/**
 * Header bell → Notifications, with an unread badge. Shared by the Home and
 * Reports tab landing screens (each loads its own unread count on focus).
 */
const NotificationBell = ({unreadCount = 0, onPress}) => (
  <Pressable
    onPress={onPress}
    style={({pressed}) => [styles.iconButton, pressed && styles.pressed]}
    accessibilityRole="button"
    accessibilityLabel={
      unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'
    }>
    <Bell size={22} color={workhorse.ink} />
    {unreadCount > 0 && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
      </View>
    )}
  </Pressable>
);

const styles = StyleSheet.create({
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 0,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: workhorse.danger,
  },
  badgeText: {
    fontFamily: fonts.body,
    fontSize: 9.5,
    fontWeight: '700',
    color: workhorse.surface,
  },
  pressed: {opacity: 0.68},
});

export default NotificationBell;
