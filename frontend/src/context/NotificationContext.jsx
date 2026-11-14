import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useAuth } from './AuthContext.jsx';
import * as api from '../api/notifications.api.js';
import { createNotificationStore, emptyNotifications } from '../utils/notificationStore.js';
const NotificationContext = createContext(null);
const adapters = { list: api.listNotifications, count: api.getUnreadCount, read: api.markNotificationRead, readAll: api.markAllNotificationsRead };

export function NotificationProvider({ children }) {
  const { user, isLoading, isTransitioning } = useAuth();
  const userId = !isLoading && !isTransitioning ? user?.id : null;
  const [snapshot, setSnapshot] = useState({ userId: null, state: emptyNotifications() });
  const runtime = useRef(null);
  useEffect(() => {
    let active = true;
    setSnapshot({ userId, state: emptyNotifications() });
    if (!userId) return;
    const store = createNotificationStore({ userId, api: adapters, environment: { document, window, navigator },
      onChange: state => { if (active) setSnapshot({ userId, state }); } });
    runtime.current = store;
    store.start();
    return () => { active = false; store.stop(); runtime.current = null; };
  }, [userId]);
  const state = snapshot.userId === userId && userId ? snapshot.state : emptyNotifications();
  return <NotificationContext.Provider value={{ ...state,
    setOpen: open => runtime.current?.setOpen(open), refresh: () => runtime.current?.refresh(),
    loadMore: () => runtime.current?.loadMore(), markRead: item => runtime.current?.markRead(item), markAllRead: () => runtime.current?.markAllRead(),
  }}>{children}</NotificationContext.Provider>;
}
export function useNotifications() { return useContext(NotificationContext); }
