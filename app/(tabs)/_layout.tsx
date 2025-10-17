import { Tabs } from 'expo-router';
import { Bookmark, Trophy, Dribbble, Activity, Flag } from 'lucide-react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: '#1e293b',
          borderTopColor: '#334155',
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: '#3b82f6',
        tabBarInactiveTintColor: '#64748b',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600' as const,
        },
      }}
    >
      <Tabs.Screen
        name="nfl"
        options={{
          title: 'NFL',
          tabBarIcon: ({ color, size }) => <Bookmark size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="cfb"
        options={{
          title: 'CFB',
          tabBarIcon: ({ color, size }) => <Flag size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="basketball"
        options={{
          title: 'Basketball',
          tabBarIcon: ({ color, size }) => <Dribbble size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="hockey"
        options={{
          title: 'Hockey',
          tabBarIcon: ({ color, size }) => <Activity size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="baseball"
        options={{
          title: 'Baseball',
          tabBarIcon: ({ color, size }) => <Trophy size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
