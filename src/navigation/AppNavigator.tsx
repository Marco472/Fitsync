import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {NavigationContainer} from '@react-navigation/native';
import {StyleSheet, View, Text} from 'react-native';
import {type RootTabParamList} from '../types';
import {HomeScreen} from '../screens/HomeScreen';
import {DevicesScreen} from '../screens/DevicesScreen';
import {WorkoutScreen} from '../screens/WorkoutScreen';
import {HistoryScreen} from '../screens/HistoryScreen';
import {AnalyticsScreen} from '../screens/AnalyticsScreen';
import {SettingsScreen} from '../screens/SettingsScreen';
import {MembershipScreen} from '../screens/MembershipScreen';
import {useAppContext} from '../context/AppContext';
import {COLORS} from '../theme';

const Tab = createBottomTabNavigator<RootTabParamList>();

function TabIcon({
  icon,
  label,
  focused,
  badge,
}: {
  icon: string;
  label: string;
  focused: boolean;
  badge?: boolean;
}) {
  return (
    <View style={styles.tabItem}>
      <View>
        <Text style={[styles.tabIcon, focused && styles.tabIconActive]}>{icon}</Text>
        {badge && <View style={styles.tabBadge} />}
      </View>
      <Text style={[styles.tabLabel, focused && styles.tabLabelActive]}>{label}</Text>
    </View>
  );
}

export function AppNavigator() {
  const {state} = useAppContext();
  const isFree = state.membership.tier === 'free';

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarShowLabel: false,
        }}>
        <Tab.Screen
          name="Home"
          component={HomeScreen}
          options={{
            tabBarIcon: ({focused}) => (
              <TabIcon icon="🏠" label="Home" focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Devices"
          component={DevicesScreen}
          options={{
            tabBarIcon: ({focused}) => (
              <TabIcon icon="📡" label="Devices" focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Workout"
          component={WorkoutScreen}
          options={{
            tabBarIcon: ({focused}) => (
              <TabIcon icon="⚡" label="Workout" focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="History"
          component={HistoryScreen}
          options={{
            tabBarIcon: ({focused}) => (
              <TabIcon icon="📋" label="History" focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Analytics"
          component={AnalyticsScreen}
          options={{
            tabBarIcon: ({focused}) => (
              <TabIcon icon="📊" label="Analytics" focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({focused}) => (
              <TabIcon icon="⚙️" label="Settings" focused={focused} />
            ),
          }}
        />
        <Tab.Screen
          name="Membership"
          component={MembershipScreen}
          options={{
            tabBarIcon: ({focused}) => (
              <TabIcon
                icon={isFree ? '👑' : '⚡'}
                label={isFree ? 'Upgrade' : 'Pro'}
                focused={focused}
                badge={isFree}
              />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: COLORS.surface,
    borderTopColor: COLORS.border,
    borderTopWidth: 1,
    height: 80,
    paddingBottom: 10,
  },
  tabItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  tabIcon: {
    fontSize: 22,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 2,
  },
  tabLabelActive: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  tabBadge: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.danger,
    borderWidth: 1,
    borderColor: COLORS.surface,
  },
});
